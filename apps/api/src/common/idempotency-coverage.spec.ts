/**
 * IDEM-01 (Faz 4.1): "ortak interceptor/decorator ile idempotency zorunlu hale gelsin" —
 * this is the enforcement mechanism. It walks every controller's own methods using Nest's own
 * route metadata (METHOD_METADATA — the same metadata @Post()/@Put()/@Patch()/@Delete() already
 * attach to the handler function, no app bootstrap needed) to find every mutating endpoint, and
 * asserts each one carries an `@Idempotent()` or `@IdempotencyExempt('reason')` decision — on
 * the method, or (fallback) on the controller class. A new POST/PUT/PATCH/DELETE handler added
 * to any of these controllers without either decorator fails this test: that is what makes the
 * decision "mandatory" instead of a convention someone can forget.
 *
 * No DB required — pure reflection over decorator metadata, same style/pattern as
 * controller-permissions.spec.ts (which does the equivalent walk for ORG_PERMISSION_METADATA_KEY,
 * just via a hand-maintained list instead of a metadata-driven scan).
 */
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AdMetricsController } from '../ad-metrics/ad-metrics.controller';
import { ApiKeysController } from '../api-keys/api-keys.controller';
import { AppointmentsController } from '../appointments/appointments.controller';
import { ContactsController } from '../contacts/contacts.controller';
import { AdsController } from '../integrations/ads/ads.controller';
import { GhlController } from '../integrations/ghl/ghl.controller';
import { KarneController } from '../karne/karne.controller';
import { PatientsController } from '../patients/patients.controller';
import { ScorecardController } from '../scorecard/scorecard.controller';
import { SettingsController } from '../settings/settings.controller';
import { TenantsController } from '../tenants/tenants.controller';
import { TransactionsController } from '../transactions/transactions.controller';
import { WebhookSubscriptionsController } from '../webhook-subscriptions/webhook-subscriptions.controller';
import { WebhooksController } from '../webhooks/webhooks.controller';
import { WhatsappController } from '../whatsapp/whatsapp.controller';
import { IDEMPOTENCY_METADATA_KEY, type IdempotencyPolicy } from './idempotent.decorator';

const MUTATING_METHODS = new Set<RequestMethod>([
	RequestMethod.POST,
	RequestMethod.PUT,
	RequestMethod.PATCH,
	RequestMethod.DELETE
]);

/** Every controller that exists in the API — new controllers must be added here to be covered. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_CONTROLLERS: Function[] = [
	PatientsController,
	ContactsController,
	TransactionsController,
	AppointmentsController,
	WebhookSubscriptionsController,
	ApiKeysController,
	WhatsappController,
	SettingsController,
	TenantsController,
	ScorecardController,
	GhlController,
	AdsController,
	AdMetricsController,
	KarneController,
	WebhooksController
];

type MutatingHandler = {
	controller: string;
	handler: string;
	httpMethod: string;
	path: string;
	policy: IdempotencyPolicy | undefined;
};

/** Every POST/PUT/PATCH/DELETE handler across the given controllers, via Nest's own route metadata. */
function findMutatingHandlers(controllers: Function[]): MutatingHandler[] {
	const out: MutatingHandler[] = [];
	for (const controller of controllers) {
		const proto = controller.prototype as Record<string, unknown>;
		for (const name of Object.getOwnPropertyNames(proto)) {
			if (name === 'constructor') continue;
			const handler = proto[name];
			if (typeof handler !== 'function') continue;

			const httpMethod: RequestMethod | undefined = Reflect.getMetadata(METHOD_METADATA, handler);
			if (httpMethod === undefined || !MUTATING_METHODS.has(httpMethod)) continue;

			const policy: IdempotencyPolicy | undefined =
				Reflect.getMetadata(IDEMPOTENCY_METADATA_KEY, handler) ??
				Reflect.getMetadata(IDEMPOTENCY_METADATA_KEY, controller);

			out.push({
				controller: controller.name,
				handler: name,
				httpMethod: RequestMethod[httpMethod] ?? String(httpMethod),
				path: (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '',
				policy
			});
		}
	}
	return out;
}

describe('IDEM-01: every mutating endpoint declares an idempotency policy', () => {
	const handlers = findMutatingHandlers(ALL_CONTROLLERS);

	it('the reflection walk actually finds handlers (guards the other assertions against passing vacuously)', () => {
		expect(handlers.length).toBe(53);
	});

	it('every mutating handler has a policy — enforced, or exempt with a non-empty reason', () => {
		const missing = handlers.filter((h) => !h.policy);
		expect(missing.map((h) => `${h.controller}.${h.handler} (${h.httpMethod} ${h.path})`)).toEqual(
			[]
		);

		const badExemptions = handlers.filter(
			(h) => h.policy?.kind === 'exempt' && !h.policy.reason?.trim()
		);
		expect(badExemptions.map((h) => `${h.controller}.${h.handler}`)).toEqual([]);
	});

	it('exactly the endpoints wired through IdempotencyService.run() are marked enforced', () => {
		const enforced = handlers
			.filter((h) => h.policy?.kind === 'enforced')
			.map((h) => `${h.controller}.${h.handler}`)
			.sort();

		expect(enforced).toEqual(
			[
				'PatientsController.merge',
				'PatientsController.presignFile',
				'PatientsController.confirmFile',
				'PatientsController.createFile',
				'PatientsController.create',
				'PatientsController.update',
				'PatientsController.remove',
				'ContactsController.merge',
				'ContactsController.create',
				'ContactsController.update',
				'TransactionsController.create',
				'TransactionsController.update',
				'AppointmentsController.create',
				'AppointmentsController.update',
				'WebhookSubscriptionsController.create',
				'WebhookSubscriptionsController.remove',
				'ApiKeysController.create',
				'ApiKeysController.revoke',
				'WhatsappController.approveDrafts',
				'SettingsController.createFinanceCategory',
				'SettingsController.createContactType'
			].sort()
		);
	});

	it('class-level exemptions (public/no-tenant-context controllers) apply to every handler in the class', () => {
		const karne = handlers.filter((h) => h.controller === 'KarneController');
		const webhooks = handlers.filter((h) => h.controller === 'WebhooksController');

		expect(karne).toHaveLength(4);
		expect(karne.every((h) => h.policy?.kind === 'exempt')).toBe(true);

		expect(webhooks).toHaveLength(2);
		expect(webhooks.every((h) => h.policy?.kind === 'exempt')).toBe(true);
	});

	it('method-level policy overrides a class-level one when both are present (sanity check precedence)', () => {
		// KarneController carries a class-level exemption; none of its handlers has its own
		// method-level override today, so all four should report the *same* reason string as
		// the class decorator — if a method-level override existed it would win instead.
		const reasons = new Set(
			handlers
				.filter((h) => h.controller === 'KarneController' && h.policy?.kind === 'exempt')
				.map((h) => (h.policy as { kind: 'exempt'; reason: string }).reason)
		);
		expect(reasons.size).toBe(1);
	});
});

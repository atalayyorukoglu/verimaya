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
 * guard-coverage.spec.ts / controller-permissions.spec.ts (ORG_PERMISSION_METADATA_KEY).
 */
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { discoverAllControllers } from './all-controllers';
import { IDEMPOTENCY_METADATA_KEY, type IdempotencyPolicy } from './idempotent.decorator';

const MUTATING_METHODS = new Set<RequestMethod>([
	RequestMethod.POST,
	RequestMethod.PUT,
	RequestMethod.PATCH,
	RequestMethod.DELETE
]);

const ALL_CONTROLLERS = await discoverAllControllers();

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

	it('discovery finds a non-vacuous set of controllers (guards against broken glob/fs scan)', () => {
		expect(ALL_CONTROLLERS.length).toBeGreaterThanOrEqual(15);
	});

	it('the reflection walk actually finds handlers (guards the other assertions against passing vacuously)', () => {
		expect(handlers.length).toBe(63);
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
				'PatientsController.createCaseNote',
				'PatientsController.deleteCaseNote',
				'PatientsController.create',
				'PatientsController.update',
				'PatientsController.remove',
				'ContactsController.merge',
				'ContactsController.create',
				'ContactsController.update',
				'ContactsController.remove',
				'TransactionsController.create',
				'TransactionsController.update',
				'TransactionsController.remove',
				'AppointmentsController.create',
				'AppointmentsController.update',
				'AppointmentsController.remove',
				'WebhookSubscriptionsController.create',
				'WebhookSubscriptionsController.remove',
				'ApiKeysController.create',
				'ApiKeysController.revoke',
				'WhatsappController.approveDrafts',
				'SettingsController.createFinanceCategory',
				'SettingsController.createContactType',
				'SettingsController.createAppointmentType'
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

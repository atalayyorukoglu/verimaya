/**
 * GAP-01 / AUDIT-F09-04 (path half): every path template exported from
 * `packages/shared` `apiPaths` must have a NestJS controller route that matches
 * it (pathname-normalized). Same reflection style as `idempotency-coverage.spec.ts`
 * — walks Nest's own METHOD_METADATA / PATH_METADATA, no app bootstrap.
 *
 * This catches the MSW ↔ real-API drift class: a path lives in the shared contract
 * (and the web/MSW call it) while Nest never registered a handler (404 in prod).
 * Appointment-type DELETE (`settingsAppointmentType`) is the canonical example.
 */
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { apiPaths } from '@verimaya/shared';
import { describe, expect, it } from 'vitest';
import { AdMetricsController } from '../ad-metrics/ad-metrics.controller';
import { ApiKeysController } from '../api-keys/api-keys.controller';
import { AppointmentsController } from '../appointments/appointments.controller';
import { AuditLogsController } from '../audit-logs/audit-logs.controller';
import { MeController } from '../auth/me.controller';
import { ContactsController } from '../contacts/contacts.controller';
import { AdsController } from '../integrations/ads/ads.controller';
import { GhlController } from '../integrations/ghl/ghl.controller';
import { MembersController } from '../members/members.controller';
import { PatientsController } from '../patients/patients.controller';
import { ReportsController } from '../reports/reports.controller';
import { ScorecardController } from '../scorecard/scorecard.controller';
import { SettingsController } from '../settings/settings.controller';
import { TenantsController } from '../tenants/tenants.controller';
import { TransactionsController } from '../transactions/transactions.controller';
import { WebhookSubscriptionsController } from '../webhook-subscriptions/webhook-subscriptions.controller';
import { WhatsappController } from '../whatsapp/whatsapp.controller';

/** Controllers that serve authenticated /v1 contract surfaces reflected by apiPaths. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_CONTROLLERS: Function[] = [
	MeController,
	TenantsController,
	MembersController,
	PatientsController,
	AppointmentsController,
	ContactsController,
	TransactionsController,
	AuditLogsController,
	SettingsController,
	GhlController,
	AdsController,
	ScorecardController,
	WhatsappController,
	AdMetricsController,
	ApiKeysController,
	WebhookSubscriptionsController,
	ReportsController
];

function joinPath(a: string, b: string): string {
	const left = a.replace(/\/$/, '');
	const right = (b ?? '').replace(/^\//, '');
	if (!left && !right) return '/';
	if (!right) return left.startsWith('/') ? left : `/${left}`;
	if (!left) return right.startsWith('/') ? right : `/${right}`;
	return `${left.startsWith('/') ? left : `/${left}`}/${right}`;
}

/** Collapse dynamic segments (`:id`, `__p0__`) so apiPaths builders match Nest templates. */
function normalizePath(path: string): string {
	const pathname = path.split('?')[0] ?? path;
	const collapsed = pathname
		.replace(/\/{2,}/g, '/')
		.replace(/\/:[^/]+/g, '/:')
		.replace(/\/__p\d+__/g, '/:');
	if (collapsed.length > 1 && collapsed.endsWith('/')) {
		return collapsed.slice(0, -1);
	}
	return collapsed || '/';
}

function nestRoutePathTemplates(controllers: Function[]): Set<string> {
	const out = new Set<string>();
	for (const controller of controllers) {
		const base = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? '';
		const proto = controller.prototype as Record<string, unknown>;
		for (const name of Object.getOwnPropertyNames(proto)) {
			if (name === 'constructor') continue;
			const handler = proto[name];
			if (typeof handler !== 'function') continue;
			const httpMethod: RequestMethod | undefined = Reflect.getMetadata(METHOD_METADATA, handler);
			if (httpMethod === undefined) continue;
			const rel = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '';
			out.add(normalizePath(joinPath('v1', joinPath(base, rel))));
		}
	}
	return out;
}

type ApiPathEntry = { key: string; path: string; normalized: string };

function expandApiPaths(): ApiPathEntry[] {
	const out: ApiPathEntry[] = [];
	for (const [key, value] of Object.entries(apiPaths)) {
		if (typeof value === 'string') {
			out.push({ key, path: value, normalized: normalizePath(value) });
			continue;
		}
		if (typeof value === 'function') {
			const args = Array.from({ length: value.length }, (_, i) => `__p${i}__`);
			const path = (value as (...a: string[]) => string)(...args);
			out.push({ key, path, normalized: normalizePath(path) });
		}
	}
	return out;
}

describe('GAP-01: every apiPaths entry has a NestJS route', () => {
	const nestPaths = nestRoutePathTemplates(ALL_CONTROLLERS);
	const entries = expandApiPaths();

	it('the reflection walk finds Nest routes (guards against vacuous pass)', () => {
		expect(nestPaths.size).toBeGreaterThan(50);
		expect(entries.length).toBeGreaterThan(50);
	});

	it('every apiPaths template normalizes to a registered Nest path', () => {
		const missing = entries.filter((e) => !nestPaths.has(e.normalized));
		expect(
			missing.map((e) => `${e.key} → ${e.path} (normalized ${e.normalized})`)
		).toEqual([]);
	});
});

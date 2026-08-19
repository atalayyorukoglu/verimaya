import { ConfigService } from '@nestjs/config';
import {
	ForbiddenException,
	type ExecutionContext
} from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { DbService } from '../db/db.service';
import { effectiveGuards, guardNames } from '../common/all-controllers';
import { PlatformAdminGuard } from '../platform/platform-admin.guard';
import { CspReportsController } from './csp-reports.controller';
import { registerCspReportParsers } from './csp-reports.http';
import { CSP_REPORT_MAX_BYTES, normalizeCspReportBody, stripUriSecrets } from './csp-reports.parse';
import { CspReportsService } from './csp-reports.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const marker = `csp-test-${crypto.randomUUID()}`;
const documentUri = `https://app.example.test/dev`;

function legacyPayload(blockedUri: string) {
	return {
		'csp-report': {
			'document-uri': `${documentUri}?tenant=${marker}`,
			'blocked-uri': blockedUri,
			'violated-directive': 'script-src',
			'effective-directive': 'script-src',
			disposition: 'report'
		}
	};
}

describe('stripUriSecrets', () => {
	it('drops query string and fragment from blocked_uri', () => {
		expect(
			stripUriSecrets(
				`https://files.example.test/preview?token=secret-value&sig=abc#frag`
			)
		).toBe('https://files.example.test/preview');
	});
});

describe('normalizeCspReportBody', () => {
	it('accepts legacy csp-report and Reporting API array', () => {
		const legacy = normalizeCspReportBody(legacyPayload('https://evil.test/x.js?q=1'));
		expect(legacy?.blockedUri).toBe('https://evil.test/x.js');
		expect(legacy?.documentUri).toBe('https://app.example.test/dev');

		const reportingApi = normalizeCspReportBody([
			{
				type: 'csp-violation',
				body: {
					documentURL: 'https://app.example.test/contacts',
					blockedURL: 'https://cdn.example.test/a.js?token=1',
					effectiveDirective: 'script-src',
					violatedDirective: 'script-src',
					disposition: 'report'
				}
			}
		]);
		expect(reportingApi?.blockedUri).toBe('https://cdn.example.test/a.js');
		expect(reportingApi?.documentUri).toBe('https://app.example.test/contacts');
	});

	it('returns null for empty or garbage bodies', () => {
		expect(normalizeCspReportBody(null)).toBeNull();
		expect(normalizeCspReportBody('')).toBeNull();
		expect(normalizeCspReportBody('not-json')).toBeNull();
		expect(normalizeCspReportBody({ hello: 'world' })).toBeNull();
	});
});

describe('CspReportsService (no tenant)', () => {
	let db: DbService;
	let service: CspReportsService;

	beforeAll(() => {
		process.env.DATABASE_URL = databaseUrl;
		db = new DbService(new ConfigService());
		service = new CspReportsService(db);
	});

	afterAll(async () => {
		await db.sql`delete from csp_reports where document_uri = ${documentUri}`;
		await db.onModuleDestroy();
	});

	it('aggregates the same violation into one row with count 2 and later last_seen_at', async () => {
		await db.sql`delete from csp_reports where document_uri = ${documentUri}`;
		const payload = legacyPayload(`https://evil.test/${marker}.js?token=secret`);

		await service.ingest(payload, 'Mozilla/5.0 Chrome/120.0.0.0');
		const [first] = await db.sql`
			select id, count, blocked_uri, last_seen_at
			from csp_reports
			where document_uri = ${documentUri}
		`;
		expect(first).toBeTruthy();
		expect(Number(first!.count)).toBe(1);
		expect(String(first!.blocked_uri)).not.toContain('?');
		expect(String(first!.blocked_uri)).not.toContain('token=');

		await db.sql`
			update csp_reports
			set last_seen_at = now() - interval '2 minutes'
			where id = ${first!.id}
		`;
		const [aged] = await db.sql`
			select last_seen_at from csp_reports where id = ${first!.id}
		`;

		await service.ingest(payload, 'Mozilla/5.0 Chrome/120.0.0.0');
		const rows = await db.sql`
			select count, last_seen_at from csp_reports where document_uri = ${documentUri}
		`;
		expect(rows).toHaveLength(1);
		expect(Number(rows[0]!.count)).toBe(2);
		expect(new Date(rows[0]!.last_seen_at as string | Date).getTime()).toBeGreaterThan(
			new Date(aged!.last_seen_at as string | Date).getTime()
		);
	});
});

describe('POST /v1/csp-reports HTTP surface', () => {
	async function makeApp(service: CspReportsService) {
		const app = Fastify();
		registerCspReportParsers(app);
		app.post('/v1/csp-reports', async (req, reply) => {
			const len = Number(req.headers['content-length'] ?? 0);
			if (Number.isFinite(len) && len > CSP_REPORT_MAX_BYTES) {
				return reply.code(413).send();
			}
			try {
				await service.ingest(req.body, undefined);
			} catch {
				/* drop */
			}
			return reply.code(204).send();
		});
		await app.ready();
		return app;
	}

	it('returns 204 for empty and garbage bodies (no 5xx)', async () => {
		const ingestCalls: unknown[] = [];
		const service = {
			ingest: async (body: unknown) => {
				ingestCalls.push(body);
			}
		} as unknown as CspReportsService;
		const app = await makeApp(service);
		const empty = await app.inject({
			method: 'POST',
			url: '/v1/csp-reports',
			headers: { 'content-type': 'application/csp-report' },
			payload: ''
		});
		expect(empty.statusCode).toBe(204);
		const garbage = await app.inject({
			method: 'POST',
			url: '/v1/csp-reports',
			headers: { 'content-type': 'application/csp-report' },
			payload: '{not json'
		});
		expect(garbage.statusCode).toBe(204);
		expect(garbage.statusCode).toBeLessThan(500);
		await app.close();
	});

	it('rejects bodies over the size cap with 413 and does not ingest', async () => {
		const ingestCalls: unknown[] = [];
		const service = {
			ingest: async (body: unknown) => {
				ingestCalls.push(body);
			}
		} as unknown as CspReportsService;
		const app = await makeApp(service);
		const payload = 'x'.repeat(CSP_REPORT_MAX_BYTES + 50);
		const res = await app.inject({
			method: 'POST',
			url: '/v1/csp-reports',
			headers: { 'content-type': 'application/csp-report' },
			payload
		});
		expect(res.statusCode).toBe(413);
		expect(ingestCalls).toHaveLength(0);
		await app.close();
	});
});

describe('GET /v1/csp-reports platform admin gate', () => {
	const guard = new PlatformAdminGuard();

	function ctx(email: string | undefined): ExecutionContext {
		return {
			switchToHttp: () => ({
				getRequest: () => ({
					authSession: email ? { user: { email } } : undefined,
					id: 'req-csp'
				})
			})
		} as ExecutionContext;
	}

	it('allows platform admin and rejects a tenant user', () => {
		const prev = process.env.PLATFORM_ADMIN_EMAILS;
		process.env.PLATFORM_ADMIN_EMAILS = 'csp-admin@example.com';
		try {
			expect(guard.canActivate(ctx('csp-admin@example.com'))).toBe(true);
			expect(() => guard.canActivate(ctx('tenant.owner@example.com'))).toThrow(
				ForbiddenException
			);
			expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
		} finally {
			if (prev === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
			else process.env.PLATFORM_ADMIN_EMAILS = prev;
		}
	});

	it('list/clear require Session+PlatformAdmin; ingest stays public', () => {
		const listGuards = guardNames(
			effectiveGuards(CspReportsController, CspReportsController.prototype.list)
		);
		const clearGuards = guardNames(
			effectiveGuards(CspReportsController, CspReportsController.prototype.clear)
		);
		const ingestGuards = guardNames(
			effectiveGuards(CspReportsController, CspReportsController.prototype.ingest)
		);
		expect(listGuards).toEqual(expect.arrayContaining(['SessionGuard', 'PlatformAdminGuard']));
		expect(clearGuards).toEqual(expect.arrayContaining(['SessionGuard', 'PlatformAdminGuard']));
		expect(ingestGuards).not.toContain('SessionGuard');
		expect(ingestGuards).not.toContain('PlatformAdminGuard');
	});
});

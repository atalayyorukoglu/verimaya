import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PATIENT_FLOW_CHECKLIST, DEFAULT_PATIENT_FLOW_NARRATIVE } from '@verimaya/shared';
import { CryptoService } from '../common/crypto.service';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { SettingsService } from './settings.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

process.env.CREDENTIALS_ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

/**
 * KISI-02 — hasta akışı şablonu tenant'a aittir: A'nın yazdığı anlatı ve kontrol
 * listesi B'de görünmez, B varsayılanı görmeye devam eder.
 */
describe('settings patient-flow tenant isolation (KISI-02)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let settingsService: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`pf-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`pf-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`pf-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`pf-b-${tenantB.slice(0, 8)}`})
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		settingsService = new SettingsService(new TenantContextService(dbService), new CryptoService());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('kaydedilmemişken gömülü varsayılan döner (22 maddelik liste)', async () => {
		const a = await settingsService.getPatientFlow(tenantA);
		expect(a.is_default).toBe(true);
		expect(a.narrative).toBe(DEFAULT_PATIENT_FLOW_NARRATIVE);
		expect(a.checklist).toHaveLength(DEFAULT_PATIENT_FLOW_CHECKLIST.length);
		expect(a.checklist).toHaveLength(22);
		expect(a.checklist[0]?.id).toBe('p01');
		expect(a.updated_by).toBeNull();
	});

	it("A'nın şablonu B'de görünmez; B varsayılanda kalır", async () => {
		await settingsService.savePatientFlow(
			tenantA,
			{
				narrative: 'A firması: hasta önce klinik onayı alır, sonra otel yazılır.',
				checklist: [
					{
						id: 'a01',
						stage: '1. Rezervasyon',
						label: 'A firmasına özel alan',
						evidence: 'A grubundaki mesaj',
						when: 'Bilet geldiğinde',
						warning: 'A alanı eksik'
					}
				]
			},
			{ actorId: null, actorDisplayName: 'Actor A' }
		);

		const a = await settingsService.getPatientFlow(tenantA);
		expect(a.is_default).toBe(false);
		expect(a.narrative).toContain('A firması');
		expect(a.checklist.map((i) => i.id)).toEqual(['a01']);
		expect(a.updated_by).toBe('Actor A');
		expect(a.updated_at).toBeTruthy();

		const b = await settingsService.getPatientFlow(tenantB);
		expect(b.is_default).toBe(true);
		expect(b.narrative).not.toContain('A firması');
		expect(b.checklist.some((i) => i.id === 'a01')).toBe(false);
	});

	it("B'nin kaydı A'yı değiştirmez ve audit satırı kendi kiracısına yazılır", async () => {
		await settingsService.savePatientFlow(
			tenantB,
			{
				narrative: 'B firması: her vizit için ayrı kontrol.',
				checklist: [
					{
						id: 'b01',
						stage: '5. Evrak',
						label: 'B firmasına özel alan',
						evidence: 'B grubundaki ek',
						when: 'İlk klinik günü',
						warning: 'B alanı eksik'
					}
				]
			},
			{ actorId: null, actorDisplayName: 'Actor B' }
		);

		const a = await settingsService.getPatientFlow(tenantA);
		expect(a.narrative).toContain('A firması');
		expect(a.checklist.map((i) => i.id)).toEqual(['a01']);

		const b = await settingsService.getPatientFlow(tenantB);
		expect(b.checklist.map((i) => i.id)).toEqual(['b01']);

		const { sql } = getDb(databaseUrl);
		const logsA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select actor_display_name
				from audit_logs
				where tenant_id = ${tenantA} and entity_label = 'patient_flow'
			`;
		});
		const logsB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`
				select actor_display_name
				from audit_logs
				where tenant_id = ${tenantB} and entity_label = 'patient_flow'
			`;
		});

		expect(logsA).toHaveLength(1);
		expect(logsA[0]?.actor_display_name).toBe('Actor A');
		expect(logsB).toHaveLength(1);
		expect(logsB[0]?.actor_display_name).toBe('Actor B');
	});
});

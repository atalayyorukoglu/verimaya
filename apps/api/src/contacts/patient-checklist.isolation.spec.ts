import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { MediaClassifyService } from '../whatsapp/media-classify.service';
import { ContactMediaService } from './contact-media.service';
import { PatientChecklistService } from './patient-checklist.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
	const { sql } = getDb(databaseUrl);
	await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
	try {
		return await fn();
	} finally {
		await sql`select set_config('app.current_tenant_id', '', false)`;
	}
}

/** Geçmişte: ekin "geldiği" an. Vizit penceresi buna göre hesaplanır. */
const VIZIT_GELIS = '2026-03-02T09:00:00Z';
const VIZIT_DONUS = '2026-03-08T18:00:00Z';
/** Vizit aralığının içi — ek buraya düşer. */
const EK_ZAMANI = '2026-03-04T11:41:00Z';

/**
 * EVRAK-01 — evrak sınıflandırma ve kontrol listesi kiracıyı aşmaz.
 *
 * İki ayrı kiracıda aynı kalıpta kayıt kurulur: A'nın eki A'nın vizitine bağlanır,
 * B'nin kontrol listesi A'nın evrakını görmez. Hesabın kendisi de burada sınanıyor
 * (pasaport var → `done`, cerrahi röntgeni yok → `missing`), çünkü hesap SQL'e
 * dayanıyor ve saf birim testiyle kapsanamıyor.
 */
describe('EVRAK-01 evrak sınıflandırma + kontrol listesi', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const contactA = randomUUID();
	const contactB = randomUUID();
	const visitA = randomUUID();
	const msgA = randomUUID();
	const msgB = randomUUID();
	let classify: MediaClassifyService;
	let checklist: PatientChecklistService;
	let media: ContactMediaService;
	let tenantContext: TenantContextService;

	async function ekYaz(
		tenantId: string,
		messageId: string,
		contactId: string,
		caption: string,
		filename: string
	) {
		const { sql } = getDb(databaseUrl);
		const externalId = `evrak-${messageId.slice(0, 8)}`;
		const sentSeconds = Math.floor(new Date(EK_ZAMANI).getTime() / 1000);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`
				insert into inbound_messages (id, tenant_id, provider, external_id, payload, status, created_at)
				values (${messageId}, ${tenantId}, 'waha', ${externalId},
					${JSON.stringify({
						payload: {
							id: externalId,
							from: '1@g.us',
							author: 'evrak@c.us',
							body: caption,
							hasMedia: true,
							timestamp: sentSeconds
						}
					})}::jsonb, 'new', ${EK_ZAMANI})
			`;
			await tx`
				insert into inbound_message_contacts (tenant_id, inbound_message_id, contact_id, method, matched_text)
				values (${tenantId}, ${messageId}, ${contactId}, 'exact', ${caption})
			`;
			await tx`
				insert into inbound_message_media
					(id, tenant_id, inbound_message_id, filename, mime_type, size_bytes, sha256, storage_key)
				values (${randomUUID()}, ${tenantId}, ${messageId}, ${filename}, 'image/jpeg', 100,
					${randomUUID().replace(/-/g, '')}, ${`k/${messageId}`})
			`;
		});
	}

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);
		for (const [id, label] of [
			[tenantA, 'A'],
			[tenantB, 'B']
		] as const) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${id}, ${`Tenant ${label}`}, ${`ev-${label}-${id.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug)
				values (${id}, ${`Tenant ${label}`}, ${`ev-${label}-${id.slice(0, 8)}`})
			`;
		}

		for (const [tenantId, contactId] of [
			[tenantA, contactA],
			[tenantB, contactB]
		] as const) {
			const typeId = randomUUID();
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`insert into contact_types (id, tenant_id, name) values (${typeId}, ${tenantId}, 'Hasta')`;
				await tx`
					insert into contacts (id, tenant_id, contact_type_id, contact_type_name, display_name)
					values (${contactId}, ${tenantId}, ${typeId}, 'Hasta', 'Claire Mccubbin')
				`;
			});
		}

		// Yalnız A'nın viziti var; B'nin hastası vizitsiz.
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				insert into contact_visits (id, tenant_id, contact_id, visit_type, arrival_at, departure_at, status)
				values (${visitA}, ${tenantA}, ${contactA}, 'visit_1', ${VIZIT_GELIS}, ${VIZIT_DONUS}, 'completed')
			`;
		});

		await ekYaz(tenantA, msgA, contactA, 'Claire Mccubbin visit 1 passport', 'IMG-0001.jpg');
		await ekYaz(tenantB, msgB, contactB, 'Claire Mccubbin visit 1 passport', 'IMG-0002.jpg');

		tenantContext = {
			withTenant: async <T>(
				tenantId: string,
				fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>
			) => withTenantSession(tenantId, () => fn({ tx: sql, db }))
		} as TenantContextService;
		classify = new MediaClassifyService(tenantContext);
		checklist = new PatientChecklistService(tenantContext);
		media = new ContactMediaService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it("A'nın eki türlenir ve A'nın vizitine bağlanır; B'ninki B'de kalır", async () => {
		const a = await classify.reclassifyAll(tenantA);
		expect(a.scanned).toBe(1);
		expect(a.updated).toBe(1);
		expect(a.linked_to_visit).toBe(1);

		const listA = await media.list(tenantA, contactA);
		expect(listA.items).toHaveLength(1);
		expect(listA.items[0]).toMatchObject({
			doc_type: 'passport',
			visit_hint: 'visit_1',
			contact_visit_id: visitA
		});

		// B yeniden sınıflandırınca yalnız KENDİ ekini görür ve viziti olmadığı
		// için hiçbir şeye bağlanmaz — A'nın viziti B'ye sızmaz.
		const b = await classify.reclassifyAll(tenantB);
		expect(b.scanned).toBe(1);
		expect(b.linked_to_visit).toBe(0);
		const listB = await media.list(tenantB, contactB);
		expect(listB.items).toHaveLength(1);
		expect(listB.items[0]).toMatchObject({ doc_type: 'passport', contact_visit_id: null });
	});

	it('ikinci çalıştırma hiçbir şeyi değiştirmez (idempotent)', async () => {
		const again = await classify.reclassifyAll(tenantA);
		expect(again).toMatchObject({ scanned: 1, updated: 0, linked_to_visit: 0 });
	});

	it('kontrol listesi kendini işaretler: pasaport var, cerrahi röntgeni yok', async () => {
		const result = await checklist.get(tenantA, contactA);
		expect(result.is_patient).toBe(true);
		const vizit = result.visits.find((v) => v.visit_id === visitA);
		expect(vizit).toBeDefined();
		const byId = new Map(vizit!.items.map((i) => [i.item_id, i]));
		// p11 = pasaport + giriş damgası → ek var.
		expect(byId.get('p11')).toMatchObject({ status: 'done', evidence_count: 1 });
		// p13 = ameliyat sonrası röntgen → yok, vizit kapandı → eksik.
		expect(byId.get('p13')?.status).toBe('missing');
		// p01'in `auto` eşlemesi yok → sistem karar vermez.
		expect(byId.get('p01')?.status).toBe('na');
	});

	it("B'nin kontrol listesi A'nın evrakını görmez", async () => {
		const result = await checklist.get(tenantB, contactB);
		// B'nin viziti yok: yalnız "Vizit belirsiz" grubu döner.
		expect(result.visits).toHaveLength(1);
		expect(result.visits[0]!.visit_id).toBeNull();
		const byId = new Map(result.visits[0]!.items.map((i) => [i.item_id, i]));
		// Kendi pasaportunu görür (vizitsiz), ama eksik demez — vizit belirsiz.
		expect(byId.get('p11')).toMatchObject({ status: 'done', evidence_count: 1 });
		expect(byId.get('p13')?.status).toBe('na');
	});

	it("B, A'nın kişisinin kontrol listesini ve eklerini okuyamaz", async () => {
		await expect(checklist.get(tenantB, contactA)).rejects.toBeInstanceOf(NotFoundException);
		await expect(media.list(tenantB, contactA)).rejects.toBeInstanceOf(NotFoundException);
	});

	it('elle düzeltme türü değiştirir; başka kiracının viziti kabul edilmez', async () => {
		const [ek] = (await media.list(tenantA, contactA)).items;
		const updated = await tenantContext.withTenant(tenantA, ({ db }) =>
			media.updateClassificationWithDb(db, ek!.id, { doc_type: 'stamp' })
		);
		expect(updated.doc_type).toBe('stamp');

		const [ekB] = (await media.list(tenantB, contactB)).items;
		await expect(
			tenantContext.withTenant(tenantB, ({ db }) =>
				media.updateClassificationWithDb(db, ekB!.id, { contact_visit_id: visitA })
			)
		).rejects.toThrow();

		// Yeniden sınıflandırma elle konmuş türü geri alır (uç açıkça "baştan etiketle" der).
		await classify.reclassifyAll(tenantA);
		const [tekrar] = (await media.list(tenantA, contactA)).items;
		expect(tekrar!.doc_type).toBe('passport');
	});
});

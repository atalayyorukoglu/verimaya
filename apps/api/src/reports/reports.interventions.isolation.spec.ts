import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService } from '../tenant/tenant-context.service';
import { InterventionsService } from './interventions.service';
import { SettingsService } from '../settings/settings.service';
import { ReportsService } from './reports.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * `GET /v1/reports/interventions` (AI-05 v1).
 * docs/2026-08-23-maya-icgoru-sorulari.md § 7 adım 7.
 *
 * Dönem sabiti: `from=2026-08-01, to=2026-08-10` (10 gün) → önceki pencere otomatik
 * `2026-07-22..2026-07-31` (bkz. `previousReportPeriod`). Bütün "mevcut dönem" satırları
 * Ağustos, bütün "önceki dönem" satırları Temmuz aralığına düşer.
 *
 * Kanıtlanan iddialar (görev tanımındaki 6 zorunlu test):
 *  1. Eşiğin altındaki değişim listeye girmez (docBelow — no_show %60→%70, eşik %20'nin altında).
 *  2. İyileşme listeye girmez (docImproved — RPT %80→%10).
 *  3. Az kayda dayanan oran listeye girmez (docSmall — total=4 < minSample 10).
 *  4. `finance:read` olmayan çağıran `revenue_drop` ve `referral_value`'yu hiç görmez.
 *  5. Boş dönemde liste boş döner (patlamaz).
 *  6. Tenant izolasyonu.
 *
 * Ek olarak: docWorse ile grup-içi sıralama (rpt_rate > no_show_rate, severity'ye göre),
 * atanmamış hekim (`doctor_contact_id: null`) hiçbir zaman bulgu üretmez, `open_incident`
 * dönem sınırını ve "en eskiden yeniye, ilk 5" kuralını uygular.
 */
const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const PERIOD = { from: '2026-08-01', to: '2026-08-10' };
const CURRENT_AT = '2026-08-05T10:00:00Z';
const PREVIOUS_AT = '2026-07-25T10:00:00Z';

describe('reports interventions (AI-05 v1)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const tenantEmpty = randomUUID();

	let interventionsA: InterventionsService;
	let interventionsB: InterventionsService;
	let interventionsEmpty: InterventionsService;

	let patientA: string;
	let docWorse: string;
	let docSmall: string;
	let docImproved: string;
	let docBelow: string;

	let referrerPositive: string;
	let referrerNegative: string;

	let incidentContactA: string;
	let incidentTypeId: string;

	let incidentContactB: string;
	let referrerB: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		const makeInterventions = () => {
			const tenantContext = new TenantContextService({ client: db, sql } as unknown as never);
			const reportsService = new ReportsService(tenantContext);
			// InterventionsService yalnız `getRevisionAppointmentType`'ı çağırıyor; o da
			// tenant_settings okumasından ibaret (CryptoService'e dokunmuyor). Tam
			// SettingsService kurmak yerine ihtiyaç duyulan tek yüzeyi veriyoruz —
			// imza genişlerse bu satır derlemede kırılır, sessizce yanlış çalışmaz.
			const settings: Pick<SettingsService, 'getRevisionAppointmentType'> = {
				getRevisionAppointmentType: async (id: string) =>
					new SettingsService(
						tenantContext,
						null as never
					).getRevisionAppointmentType(id)
			};
			return new InterventionsService(
				tenantContext,
				reportsService,
				settings as SettingsService
			);
		};

		interventionsA = makeInterventions();
		interventionsB = makeInterventions();
		interventionsEmpty = makeInterventions();

		for (const [tenantId, name] of [
			[tenantA, 'Interventions A'],
			[tenantB, 'Interventions B'],
			[tenantEmpty, 'Interventions Empty']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, ${name}, ${`iv-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, timezone)
				values (${tenantId}, ${name}, ${`iv-${tenantId.slice(0, 8)}`}, 'Europe/Istanbul')
			`;
		}

		// ---- Tenant A ----------------------------------------------------------
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Hasta', 0) on conflict do nothing`;
			const typeId = (
				await tx`select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1`
			)[0]!.id as string;

			const [patient] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (${tenantA}, ${typeId}, 'Hasta', 'A', 'Hasta A')
				returning id
			`;
			patientA = patient!.id as string;
			incidentContactA = patientA;

			const makeDoctor = async (name: string) => {
				const [row] = await tx`
					insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
					values (${tenantA}, ${typeId}, 'Hasta', ${name}, ${name})
					returning id
				`;
				return row!.id as string;
			};
			docWorse = await makeDoctor('Dr. Worsened');
			docSmall = await makeDoctor('Dr. Small');
			docImproved = await makeDoctor('Dr. Improved');
			docBelow = await makeDoctor('Dr. Below');

			type ApptSeed = { status: string; type: string | null; doctor: string | null; at: string };
			const seeds: ApptSeed[] = [];
			const push = (
				doctor: string | null,
				at: string,
				statuses: string[],
				types: Array<string | null>
			) => {
				statuses.forEach((status, i) => seeds.push({ status, type: types[i]!, doctor, at }));
			};

			// docWorse — no_show ve rpt_rate kötüleşiyor (worsened, reportable);
			// cancel_rate değişmiyor (improved skip'i tetikler, bulgu üretilmez).
			push(
				docWorse,
				CURRENT_AT,
				['no_show', 'no_show', 'no_show', 'no_show', 'cancelled', 'completed', 'completed', 'completed', 'completed', 'completed'],
				['RPT', 'RPT', 'RPT', 'RPT', 'Muayene', 'Muayene', 'Muayene', 'Muayene', 'Muayene', 'Muayene']
			);
			push(
				docWorse,
				PREVIOUS_AT,
				['no_show', 'cancelled', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed'],
				['RPT', 'Muayene', 'Muayene', 'Muayene', 'Muayene', 'Muayene', 'Muayene', 'Muayene', 'Muayene', 'Muayene']
			);

			// docSmall — total=4 < minSample(10): büyük RPT sıçraması olsa da (25%→75%)
			// "insufficient_sample" ile elenmeli.
			push(docSmall, CURRENT_AT, ['completed', 'completed', 'completed', 'completed'], [
				'RPT',
				'RPT',
				'RPT',
				'Muayene'
			]);
			push(docSmall, PREVIOUS_AT, ['completed', 'completed', 'completed', 'completed'], [
				'RPT',
				'Muayene',
				'Muayene',
				'Muayene'
			]);

			// docImproved — RPT %80 → %10: iyileşme, listeye girmemeli.
			push(
				docImproved,
				CURRENT_AT,
				['no_show', 'cancelled', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed'],
				['RPT', 'Muayene', 'Muayene', 'Muayene', 'Muayene', 'Muayene', 'Muayene', 'Muayene', 'Muayene', 'Muayene']
			);
			push(
				docImproved,
				PREVIOUS_AT,
				['no_show', 'cancelled', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed'],
				['RPT', 'RPT', 'RPT', 'RPT', 'RPT', 'RPT', 'RPT', 'RPT', 'Muayene', 'Muayene']
			);

			// docBelow — no_show %60 → %70: göreli değişim %16.7, eşik %20'nin altında.
			push(
				docBelow,
				CURRENT_AT,
				['no_show', 'no_show', 'no_show', 'no_show', 'no_show', 'no_show', 'no_show', 'cancelled', 'completed', 'completed'],
				new Array(10).fill('Muayene')
			);
			push(
				docBelow,
				PREVIOUS_AT,
				['no_show', 'no_show', 'no_show', 'no_show', 'no_show', 'no_show', 'cancelled', 'completed', 'completed', 'completed'],
				new Array(10).fill('Muayene')
			);

			// Atanmamış hekim (doctor: null) — no_show %10 → %90, dev bir sıçrama ama
			// eyleme dönük bir hedef olmadığı için hiçbir zaman bulgu üretmemeli.
			push(
				null,
				CURRENT_AT,
				['no_show', 'no_show', 'no_show', 'no_show', 'no_show', 'no_show', 'no_show', 'no_show', 'no_show', 'completed'],
				new Array(10).fill('Muayene')
			);
			push(
				null,
				PREVIOUS_AT,
				['no_show', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed'],
				new Array(10).fill('Muayene')
			);

			for (const seed of seeds) {
				await tx`
					insert into appointments (
						tenant_id, contact_id, contact_display_name, status, appointment_type, doctor_contact_id, starts_at, created_at, updated_at
					) values (
						${tenantA}, ${patientA}, 'Hasta A', ${seed.status}, ${seed.type}, ${seed.doctor}, ${seed.at}, now(), now()
					)
				`;
			}

			// revenue_drop: gelir 200.000 → 100.000 (mevcut dönemin %5'lik eşiğini de
			// aşan, işletme ölçeğine göre önemli bir düşüş). 5 işlem her iki dönemde de
			// (minSample=5 tam sınırda geçerli).
			const prevTxAmounts = [40000, 40000, 40000, 40000, 40000];
			const prevTxDates = ['2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27'];
			for (let i = 0; i < prevTxAmounts.length; i++) {
				await tx`
					insert into transactions (
						tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency
					) values (
						${tenantA}, 'income', 'Önceki dönem geliri', ${prevTxDates[i]}, 'paid', ${prevTxAmounts[i]}, ${prevTxAmounts[i]}, ${prevTxAmounts[i]}, 'TRY'
					)
				`;
			}
			const currTxAmounts = [20000, 20000, 20000, 20000, 20000];
			const currTxDates = ['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'];
			for (let i = 0; i < currTxAmounts.length; i++) {
				await tx`
					insert into transactions (
						tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency
					) values (
						${tenantA}, 'income', 'Mevcut dönem geliri', ${currTxDates[i]}, 'paid', ${currTxAmounts[i]}, ${currTxAmounts[i]}, ${currTxAmounts[i]}, 'TRY'
					)
				`;
			}

			// referral_value: pozitif net'i olan referrerPositive listeye girmeli,
			// yalnız gideri olan referrerNegative (negatif net) hiç girmemeli.
			const [refPos] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (${tenantA}, ${typeId}, 'Hasta', 'R', 'Referans Veren Pozitif')
				returning id
			`;
			referrerPositive = refPos!.id as string;
			const [referredPos] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, referred_by_contact_id)
				values (${tenantA}, ${typeId}, 'Hasta', 'P', 'Getirilen Pozitif', ${referrerPositive})
				returning id
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				) values (
					${tenantA}, 'income', 'Referans geliri', '2026-08-03', 'paid', 50000, 50000, 50000, 'TRY', ${referredPos!.id}
				)
			`;

			const [refNeg] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (${tenantA}, ${typeId}, 'Hasta', 'N', 'Referans Veren Negatif')
				returning id
			`;
			referrerNegative = refNeg!.id as string;
			const [referredNeg] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, referred_by_contact_id)
				values (${tenantA}, ${typeId}, 'Hasta', 'M', 'Getirilen Negatif', ${referrerNegative})
				returning id
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				) values (
					${tenantA}, 'expense', 'Referans gideri', '2026-08-03', 'paid', 30000, 30000, 30000, 'TRY', ${referredNeg!.id}
				)
			`;

			// open_incident: 7 açık (Ağu 01..07) + 1 çözülmüş (Ağu 02, hariç) + 1 açık
			// ama dönem dışı (Tem 15, hariç). Beklenen: ilk 5 (en eski) — Ağu 01..05.
			const [incType] = await tx`
				insert into incident_types (tenant_id, area, name, sort_order)
				values (${tenantA}, 'clinic', 'Revizyon gerekti', 0)
				returning id
			`;
			incidentTypeId = incType!.id as string;

			for (let day = 1; day <= 7; day++) {
				const occurredOn = `2026-08-0${day}`;
				await tx`
					insert into incidents (tenant_id, contact_id, incident_type_id, area, status, occurred_on)
					values (${tenantA}, ${patientA}, ${incidentTypeId}, 'clinic', 'open', ${occurredOn})
				`;
			}
			await tx`
				insert into incidents (tenant_id, contact_id, incident_type_id, area, status, occurred_on, resolved_at)
				values (${tenantA}, ${patientA}, ${incidentTypeId}, 'clinic', 'resolved', '2026-08-02', now())
			`;
			await tx`
				insert into incidents (tenant_id, contact_id, incident_type_id, area, status, occurred_on)
				values (${tenantA}, ${patientA}, ${incidentTypeId}, 'clinic', 'open', '2026-07-15')
			`;
		});

		// ---- Tenant B (izolasyon) ----------------------------------------------
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order)
				values (${tenantB}, 'Hasta', 0) on conflict do nothing`;
			const typeId = (
				await tx`select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1`
			)[0]!.id as string;

			const [patient] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (${tenantB}, ${typeId}, 'Hasta', 'B', 'Hasta B')
				returning id
			`;
			incidentContactB = patient!.id as string;

			const [incType] = await tx`
				insert into incident_types (tenant_id, area, name, sort_order)
				values (${tenantB}, 'clinic', 'Revizyon gerekti', 0)
				returning id
			`;
			await tx`
				insert into incidents (tenant_id, contact_id, incident_type_id, area, status, occurred_on)
				values (${tenantB}, ${incidentContactB}, ${incType!.id}, 'clinic', 'open', '2026-08-03')
			`;

			const [referrer] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (${tenantB}, ${typeId}, 'Hasta', 'W', 'Tenant B Referrer')
				returning id
			`;
			referrerB = referrer!.id as string;
			const [referred] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, referred_by_contact_id)
				values (${tenantB}, ${typeId}, 'Hasta', 'V', 'Getirilen V', ${referrerB})
				returning id
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				) values (
					${tenantB}, 'income', 'Tenant B geliri', '2026-08-03', 'paid', 15000, 15000, 15000, 'TRY', ${referred!.id}
				)
			`;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB, tenantEmpty]);
		await closeDb();
	});

	it('quality_drop: yalnız eşiği aşan, eyleme dönük (hekimli) bulguları üretir; grup içi sıralama severity’ye göredir', async () => {
		const report = await interventionsA.get(tenantA, PERIOD, true);
		const group = report.groups.find((g) => g.kind === 'quality_drop');
		expect(group).toBeDefined();

		// docWorse: rpt_rate (severity 3.0) > no_show_rate (severity 2.1); cancel_rate yok.
		expect(group?.items).toHaveLength(2);
		expect(group?.items[0]).toMatchObject({
			subject_id: docWorse,
			metric: 'rpt_rate',
			current: 0.4,
			previous: 0.1,
			sample_size: 10
		});
		expect(group?.items[1]).toMatchObject({
			subject_id: docWorse,
			metric: 'no_show_rate',
			current: 0.4,
			previous: 0.1
		});
		expect(group?.items[0]!.severity).toBeGreaterThan(group?.items[1]!.severity ?? 0);
		expect(group?.items.every((item) => item.subject_id === docWorse)).toBe(true);
		expect(group?.items[0]!.link).toEqual({
			route: '/reports',
			params: { tab: 'ozet', from: PERIOD.from, to: PERIOD.to }
		});
	});

	it('eşiğin altındaki değişim listeye girmez (docBelow — no_show %60→%70, eşik %20 altında)', async () => {
		const report = await interventionsA.get(tenantA, PERIOD, true);
		const group = report.groups.find((g) => g.kind === 'quality_drop');
		expect(group?.items.some((item) => item.subject_id === docBelow)).toBe(false);
	});

	it('iyileşme listeye girmez (docImproved — RPT %80→%10)', async () => {
		const report = await interventionsA.get(tenantA, PERIOD, true);
		const group = report.groups.find((g) => g.kind === 'quality_drop');
		expect(group?.items.some((item) => item.subject_id === docImproved)).toBe(false);
	});

	it('az kayda dayanan oran listeye girmez (docSmall — total=4 < minSample 10)', async () => {
		const report = await interventionsA.get(tenantA, PERIOD, true);
		const group = report.groups.find((g) => g.kind === 'quality_drop');
		expect(group?.items.some((item) => item.subject_id === docSmall)).toBe(false);
	});

	it('atanmamış hekim (doctor_contact_id: null) hiçbir zaman bulgu üretmez', async () => {
		const report = await interventionsA.get(tenantA, PERIOD, true);
		const group = report.groups.find((g) => g.kind === 'quality_drop');
		expect(group?.items.every((item) => item.subject_id !== null)).toBe(true);
		expect(group?.items).toHaveLength(2); // yalnız docWorse — atanmamış bucket hiç yok
	});

	it('revenue_drop: dönem geliri ve neti düştüğünde bulgu üretir (finance:read varken)', async () => {
		const report = await interventionsA.get(tenantA, PERIOD, true);
		const group = report.groups.find((g) => g.kind === 'revenue_drop');
		expect(group).toBeDefined();
		expect(group?.items).toHaveLength(2);
		// Gelir: 5×20000 (dönem geliri) + 50000 (referral_value fixture'ının pozitif
		// geliri, aynı dönem) = 150000. İşlem sayısı 5 + 2 (referral gelir+gider) = 7.
		const income = group?.items.find((i) => i.kind === 'revenue_drop' && i.metric === 'income');
		expect(income).toMatchObject({ current: 150000, previous: 200000, sample_size: 7 });
		const net = group?.items.find((i) => i.kind === 'revenue_drop' && i.metric === 'net');
		// Net: 150000 gelir − 30000 gider (referral_value'nun negatif referrer'ı) = 120000.
		expect(net).toMatchObject({ current: 120000, previous: 200000, sample_size: 7 });
	});

	it('referral_value: yalnız pozitif net’i olan referans veren, ilk N sırasıyla', async () => {
		const report = await interventionsA.get(tenantA, PERIOD, true);
		const group = report.groups.find((g) => g.kind === 'referral_value');
		expect(group).toBeDefined();
		expect(group?.items.some((i) => i.subject_id === referrerPositive)).toBe(true);
		expect(group?.items.some((i) => i.subject_id === referrerNegative)).toBe(false);
		const positive = group?.items.find((i) => i.subject_id === referrerPositive);
		expect(positive).toMatchObject({ total_net_base: 50000, referred_count: 1 });
	});

	it('open_incident: dönem sınırını uygular, çözülmüşü hariç tutar, en eskiden yeniye ilk 5’i döner', async () => {
		const report = await interventionsA.get(tenantA, PERIOD, true);
		const group = report.groups.find((g) => g.kind === 'open_incident');
		expect(group).toBeDefined();
		expect(group?.items).toHaveLength(5);
		const dates = group?.items.map((i) => (i.kind === 'open_incident' ? i.occurred_on : null));
		expect(dates).toEqual(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05']);
		expect(group?.items[0]).toMatchObject({
			subject_id: incidentContactA,
			incident_type_name: 'Revizyon gerekti',
			area: 'clinic',
			link: { route: '/contacts/[id]', params: { id: incidentContactA } }
		});
	});

	it('finance:read olmayan çağıran revenue_drop ve referral_value’yu hiç görmez, diğerleri etkilenmez', async () => {
		const report = await interventionsA.get(tenantA, PERIOD, false);
		expect(report.groups.some((g) => g.kind === 'revenue_drop')).toBe(false);
		expect(report.groups.some((g) => g.kind === 'referral_value')).toBe(false);
		// Para taşımayan bulgular etkilenmemeli.
		expect(report.groups.some((g) => g.kind === 'quality_drop')).toBe(true);
		expect(report.groups.some((g) => g.kind === 'open_incident')).toBe(true);
	});

	it('boş dönemde liste boş döner, patlamaz', async () => {
		const report = await interventionsEmpty.get(tenantEmpty, {}, true);
		expect(report.groups).toEqual([]);
		expect(report.previous_period).toBeNull();
	});

	it('tenant izolasyonu: Tenant B yalnız kendi olayını/referansını görür, Tenant A’yı hiç görmez', async () => {
		const reportB = await interventionsB.get(tenantB, PERIOD, true);

		const incidentGroupB = reportB.groups.find((g) => g.kind === 'open_incident');
		expect(incidentGroupB?.items).toHaveLength(1);
		expect(incidentGroupB?.items[0]?.subject_id).toBe(incidentContactB);
		expect(incidentGroupB?.items.some((i) => i.subject_id === incidentContactA)).toBe(false);

		const referralGroupB = reportB.groups.find((g) => g.kind === 'referral_value');
		expect(referralGroupB?.items.some((i) => i.subject_id === referrerB)).toBe(true);
		expect(referralGroupB?.items.some((i) => i.subject_id === referrerPositive)).toBe(false);

		const reportA = await interventionsA.get(tenantA, PERIOD, true);
		const incidentGroupA = reportA.groups.find((g) => g.kind === 'open_incident');
		expect(incidentGroupA?.items.some((i) => i.subject_id === incidentContactB)).toBe(false);
	});
});

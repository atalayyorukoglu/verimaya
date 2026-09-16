import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import type {
	ContactSummary,
	ContactSummaryMissing,
	ContactSummarySentence,
	ContactSummarySource,
	PatientFlow
} from '@verimaya/shared';
import {
	PATIENT_FLOW_MAX_MISSING,
	PATIENT_FLOW_SETTING_KEY,
	defaultPatientFlow,
	patientFlowSchema
} from '@verimaya/shared';
import { appointments } from '../db/schema/appointments';
import { caseNotes } from '../db/schema/case-notes';
import { contactSummaries } from '../db/schema/contact-summaries';
import { contacts } from '../db/schema/contacts';
import { inboundMessageContacts } from '../db/schema/inbound-message-contacts';
import { inboundMessages } from '../db/schema/inbound-messages';
import { tenantSettings } from '../db/schema/tenant-settings';
import { transactions } from '../db/schema/transactions';
import { whatsappChats } from '../db/schema/whatsapp-chats';
import {
	LLM_CLIENT,
	writeLlmParseLedger,
	type ContactSummaryItem,
	type ContactSummaryPatientFlow,
	type LlmClient
} from '../integrations/llm';
import { maskMessagePii } from '../integrations/llm/pii-mask';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { asRecord, extractInboundDisplayFields } from '../whatsapp/inbound-mapper';
import { heuristicSummarizeContact } from './heuristic-contact-summary';

/** Modele giden yer tutucu; çıktıda kişinin adına geri çevrilir. */
const SUBJECT_TOKEN = '[HASTA]';
/** Bayat özet en erken bu kadar sonra kendiliğinden yenilenir (her açılışta LLM çağrısı olmasın). */
const AUTO_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
const LIMITS = { whatsapp: 80, appointments: 20, transactions: 40, notes: 30 } as const;
/**
 * KISI-02 — hasta akışı şablonu yalnız bu türdeki kişilerde devreye girer.
 * `contacts.contact_type_name` denormalize metindir; karşılaştırma Türkçe küçük harfle.
 */
const PATIENT_TYPE_NAME = 'hasta';

type Kanit = ContactSummaryItem & {
	id: string;
	/** Parmak izi için: kayıt değişince özet bayatlasın. */
	stamp: string;
	/** Arayüzde gösterilecek kısa alıntı (maskesiz; kullanıcı zaten görebiliyor). */
	quote: string;
};

function para(amount: number, currency: string): string {
	return `${(amount / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currency}`;
}

function kirp(s: string | null | undefined, n: number): string {
	const t = (s ?? '').replace(/\s+/g, ' ').trim();
	return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * KISI-01 adım 3 — kişi özeti.
 *
 * Kişinin akışı (WhatsApp mesajları + randevu + işlem + not) ref'li satırlara
 * çevrilir, kişinin adı maskelenir, modele gider; dönen cümlelerin ref'leri
 * kaynak kayıtlara bağlanır. Özet önbellekte durur; giren kayıtların parmak izi
 * değişince `stale` olur ve (soğuma süresi geçtiyse) açılışta yenilenir.
 */
@Injectable()
export class ContactSummaryService {
	private readonly logger = new Logger(ContactSummaryService.name);

	constructor(
		private readonly tenantContext: TenantContextService,
		@Inject(LLM_CLIENT) private readonly llm: LlmClient
	) {}

	async get(
		tenantId: string,
		contactId: string,
		opts: { refresh: boolean }
	): Promise<ContactSummary> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [contact] = await db
				.select({
					id: contacts.id,
					displayName: contacts.displayName,
					firstName: contacts.firstName,
					lastName: contacts.lastName,
					contactTypeName: contacts.contactTypeName
				})
				.from(contacts)
				.where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
				.limit(1);
			if (!contact) {
				throw new NotFoundException({ error: { code: 'not_found', message: 'Contact not found' } });
			}

			const kanitlar = await this.kanitlariTopla(db, contactId);

			// Hasta değilse şablon hiç okunmaz: ne isteme girer, ne parmak izine.
			const isPatient =
				contact.contactTypeName.trim().toLocaleLowerCase('tr') === PATIENT_TYPE_NAME;
			const flow = isPatient ? await this.hastaAkisiOku(db) : null;
			const flowStamp = flow
				? createHash('sha256')
						.update(JSON.stringify({ narrative: flow.narrative, checklist: flow.checklist }))
						.digest('hex')
				: '';

			const fingerprint = createHash('sha256')
				.update(
					kanitlar
						.map((k) => k.stamp)
						.sort()
						.join('|')
				)
				// Şablon değişince özet bayatlasın — eksik listesi eski şablona göre kalmasın.
				.update(`|pf:${flowStamp}`)
				.digest('hex');

			const [existing] = await db
				.select()
				.from(contactSummaries)
				.where(eq(contactSummaries.contactId, contactId))
				.limit(1);

			const stale = !existing || existing.inputFingerprint !== fingerprint;
			const cooled =
				!existing || Date.now() - existing.generatedAt.getTime() > AUTO_REFRESH_COOLDOWN_MS;
			const shouldGenerate =
				kanitlar.length > 0 && (opts.refresh || !existing || (stale && cooled));

			if (!shouldGenerate) {
				return this.toApi(contactId, existing ?? null, stale);
			}

			const subjectNames = [contact.displayName, contact.firstName, contact.lastName]
				.filter((s): s is string => !!s && s.trim().length >= 3)
				.sort((a, b) => b.length - a.length);
			const items: ContactSummaryItem[] = kanitlar.map((k) => ({
				ref: k.ref,
				kind: k.kind,
				at: k.at,
				text: this.maskele(k.text, subjectNames)
			}));

			const patientFlow: ContactSummaryPatientFlow | null = flow
				? { narrative: flow.narrative, checklist: flow.checklist }
				: null;

			let result = await this.llm.summarizeContact({
				items,
				subjectToken: SUBJECT_TOKEN,
				patientFlow
			});
			await writeLlmParseLedger(db, tenantId, result.usage);
			let heuristic = result.heuristic;
			if (result.sentences.length === 0) {
				// Model yazamadı (hata / boş): kural tabanlı özet, ama "model" damgası yok.
				// Kural tabanlı yol kontrol listesini okuyamaz; eksik listesi de boşalır.
				result = {
					...result,
					sentences: heuristicSummarizeContact({ items, subjectToken: SUBJECT_TOKEN }),
					missing: []
				};
				heuristic = true;
			}

			const byRef = new Map(kanitlar.map((k) => [k.ref, k]));
			const sentences: ContactSummarySentence[] = result.sentences.map((s) => ({
				text: s.text.split(SUBJECT_TOKEN).join(contact.displayName),
				sources: s.refs
					.map((r): ContactSummarySource | null => {
						const k = byRef.get(r);
						return k ? { kind: k.kind, id: k.id, at: k.at, quote: k.quote || null } : null;
					})
					.filter((x): x is ContactSummarySource => x !== null)
			}));

			// Modelin bildirdiği eksikler şablondaki metinle zenginleşir: kart, ayarları
			// okuma izni olmadan da uyarıyı gösterebilsin.
			const byItemId = new Map((flow?.checklist ?? []).map((i) => [i.id, i]));
			const missing: ContactSummaryMissing[] = result.missing
				.slice(0, PATIENT_FLOW_MAX_MISSING)
				.flatMap((m) => {
					const item = byItemId.get(m.item_id);
					if (!item) return [];
					return [
						{
							item_id: item.id,
							label: item.label,
							warning: item.warning,
							note: kirp(m.note, 300)
						}
					];
				});

			const now = new Date();
			const values = {
				tenantId,
				contactId,
				sentences,
				missing,
				inputFingerprint: fingerprint,
				inputCount: kanitlar.length,
				model: heuristic ? null : result.usage.model,
				heuristic,
				generatedAt: now,
				updatedAt: now
			};
			const [row] = await db
				.insert(contactSummaries)
				.values(values)
				.onConflictDoUpdate({
					target: [contactSummaries.tenantId, contactSummaries.contactId],
					set: values
				})
				.returning();
			return this.toApi(contactId, row ?? null, false);
		});
	}

	private toApi(
		contactId: string,
		row: typeof contactSummaries.$inferSelect | null,
		stale: boolean
	): ContactSummary {
		return {
			contact_id: contactId,
			sentences: row?.sentences ?? [],
			generated_at: row ? row.generatedAt.toISOString() : null,
			stale,
			heuristic: row?.heuristic ?? false,
			model: row?.model ?? null,
			input_count: row?.inputCount ?? 0,
			missing: row?.missing ?? []
		};
	}

	/**
	 * KISI-02 — tenant'ın hasta akışı şablonu. Kaydedilmemişse gömülü varsayılan;
	 * satır bozuksa yine varsayılan (özet üretimi şablon yüzünden durmasın).
	 * `SettingsService.getPatientFlow` ile aynı sözleşme, ama açık işlem içinde okur.
	 */
	private async hastaAkisiOku(db: TenantDb): Promise<PatientFlow> {
		const [row] = await db
			.select({ value: tenantSettings.value })
			.from(tenantSettings)
			.where(eq(tenantSettings.key, PATIENT_FLOW_SETTING_KEY))
			.limit(1);
		if (row?.value == null) return defaultPatientFlow();
		const parsed = patientFlowSchema.safeParse(row.value);
		return parsed.success ? parsed.data : defaultPatientFlow();
	}

	/** Kişinin adı `[HASTA]`; telefon/e-posta/IBAN yer tutucu. Model isim görmez. */
	private maskele(text: string, subjectNames: string[]): string {
		let out = text;
		for (const name of subjectNames) {
			out = out.replace(new RegExp(escapeRe(name), 'gi'), SUBJECT_TOKEN);
		}
		return maskMessagePii(out);
	}

	/** Dört kaynak, tek liste; ref'ler türe göre W/R/P/N + sıra. */
	private async kanitlariTopla(db: TenantDb, contactId: string): Promise<Kanit[]> {
		const out: Kanit[] = [];

		const msgs = await db
			.select({
				id: inboundMessages.id,
				payload: inboundMessages.payload,
				createdAt: inboundMessages.createdAt
			})
			.from(inboundMessages)
			.innerJoin(
				inboundMessageContacts,
				eq(inboundMessageContacts.inboundMessageId, inboundMessages.id)
			)
			.where(eq(inboundMessageContacts.contactId, contactId))
			.orderBy(desc(inboundMessages.createdAt))
			.limit(LIMITS.whatsapp);
		const chats = new Map(
			(
				await db
					.select({ chatId: whatsappChats.chatId, name: whatsappChats.name })
					.from(whatsappChats)
			).map((c) => [c.chatId, c.name])
		);
		msgs.reverse().forEach((m, i) => {
			const d = extractInboundDisplayFields(asRecord(m.payload) ?? {});
			const body = kirp(d.body, 400);
			if (!body) return;
			const grup = (d.chat_id && chats.get(d.chat_id)) || 'WhatsApp';
			out.push({
				ref: `W${i + 1}`,
				kind: 'whatsapp',
				id: m.id,
				at: m.createdAt.toISOString(),
				text: `${grup}: ${body}${d.has_media ? ' (ek var)' : ''}`,
				stamp: `w:${m.id}`,
				quote: kirp(d.body, 200)
			});
		});

		const appts = await db
			.select()
			.from(appointments)
			.where(and(eq(appointments.contactId, contactId), isNull(appointments.deletedAt)))
			.orderBy(desc(appointments.startsAt))
			.limit(LIMITS.appointments);
		appts.reverse().forEach((a, i) => {
			const parts = [
				`Randevu ${a.appointmentType ?? a.title ?? ''}`.trim(),
				`durum ${a.status}`,
				a.clinicName ? `klinik ${a.clinicName}` : null,
				a.hotelName ? `otel ${a.hotelName}` : null,
				a.endsAt ? `dönüş ${a.endsAt.toISOString().slice(0, 10)}` : null,
				kirp(a.notes, 200) || null
			].filter(Boolean);
			out.push({
				ref: `R${i + 1}`,
				kind: 'appointment',
				id: a.id,
				at: a.startsAt.toISOString(),
				text: parts.join(' · '),
				stamp: `r:${a.id}:${a.updatedAt.toISOString()}`,
				quote: parts.slice(0, 4).join(' · ')
			});
		});

		const txs = await db
			.select()
			.from(transactions)
			.where(
				and(
					or(eq(transactions.contactId, contactId), eq(transactions.caseContactId, contactId)),
					isNull(transactions.deletedAt)
				)
			)
			.orderBy(desc(transactions.occurredOn))
			.limit(LIMITS.transactions);
		txs.reverse().forEach((t, i) => {
			const parts = [
				`${t.kind === 'income' ? 'Gelir' : 'Gider'} ${para(t.amount, t.currency)}`,
				t.status ? `ödeme ${t.status}` : null,
				t.category ? t.category : null,
				kirp(t.description ?? t.title, 200) || null
			].filter(Boolean);
			out.push({
				ref: `P${i + 1}`,
				kind: 'transaction',
				id: t.id,
				at: `${t.occurredOn}T00:00:00.000Z`,
				text: parts.join(' · '),
				stamp: `p:${t.id}:${t.updatedAt.toISOString()}`,
				quote: parts.join(' · ')
			});
		});

		const notes = await db
			.select()
			.from(caseNotes)
			.where(eq(caseNotes.contactId, contactId))
			.orderBy(desc(caseNotes.createdAt))
			.limit(LIMITS.notes);
		notes.reverse().forEach((n, i) => {
			out.push({
				ref: `N${i + 1}`,
				kind: 'note',
				id: n.id,
				at: n.createdAt.toISOString(),
				text: `Çalışan notu (${n.authorDisplayName}): ${kirp(n.body, 400)}`,
				stamp: `n:${n.id}`,
				quote: kirp(n.body, 200)
			});
		});

		out.sort((a, b) => a.at.localeCompare(b.at));
		return out;
	}
}

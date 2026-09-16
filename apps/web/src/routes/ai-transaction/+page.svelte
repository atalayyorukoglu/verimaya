<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import type {
		AppointmentCreate,
		AppointmentUpdate,
		ApproveDraftItem,
		ApproveDraftsResponse,
		Contact,
		ContactType,
		ContactVisitCreate,
		ContactVisitSuggestion,
		ContactVisitSuggestionApproveAllResult,
		ContactVisitSuggestionConfidence,
		ContactVisitSuggestionRejectAllResult,
		ContactVisitType,
		FinanceCategory,
		InboundMessage,
		InboundMessageContactRef,
		InboundMessageKind,
		InboundMessageCreateContactResponse,
		InboundMessageLinkContactsResponse,
		Tenant,
		TransactionDraft,
		TransactionEvidenceEntry
	} from '@verimaya/shared';
	import {
		apiPaths,
		approveDraftItemSchema,
		contactVisitTypeLabels,
		contactVisitTypeSchema,
		DEFAULT_TENANT_TIMEZONE,
		inboundMessageStatusLabels,
		toTenantDayKey
	} from '@verimaya/shared';
	import { resolve } from '$app/paths';
	import { apiGet, apiSend, fieldClass, listUrl } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { fetchAllInbox } from '$lib/whatsapp/inbox';
	import { openInboundMedia } from '$lib/whatsapp/media';
	import { formatDateTime } from '$lib/format';
	import { locateEvidenceQuote } from '$lib/finance/evidence-highlight';
	import { t } from '$lib/i18n/locale.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import AppointmentFormDialog from '$lib/components/AppointmentFormDialog.svelte';
	import TransactionDraftCard, {
		type DraftApprovalState
	} from '$lib/components/TransactionDraftCard.svelte';
	import { Button } from '$lib/components/ui/button';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	type ContactsPage = { items: Contact[]; next_cursor: string | null };
	type DraftState = DraftApprovalState;

	const queryClient = useQueryClient();
	const qs = useQueryScope();
	let message = $state('');
	let parsing = $state(false);
	let parseError = $state<string | null>(null);
	let processing = $state(false);
	let approving = $state(false);
	let creatingInline = $state(false);
	let drafts = $state<DraftState[]>([]);
	let activeInboxId = $state<string | null>(null);
	let showLongWarning = $state(false);
	/** AI çıktısının orijinali — kullanıcı düzelttiğinde correction kaydı için kıyaslanır. */
	let originalDrafts = $state<TransactionDraft[]>([]);
	/** AI-09 — tıklanan kaynak rozetinin alıntısı; mesaj metninde vurgulanır. */
	let evidenceHighlight = $state<TransactionEvidenceEntry | null>(null);
	/** İşlem detayından gelen, zaten onaylanmış kaynak mesajı görüntüleniyor. */
	let viewingApprovedSource = $state(false);

	const inboxQuery = createQuery(() => ({
		queryKey: qs.keys.whatsapp.inbox(),
		queryFn: fetchAllInbox,
		enabled: qs.ready
	}));

	const contactsQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.list({ limit: 100, for: 'whatsapp' }),
		queryFn: () => apiGet<ContactsPage>(listUrl('contacts', { limit: 100 })),
		enabled: qs.ready
	}));

	const categoriesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.financeCategories(),
		queryFn: () => apiGet<{ items: FinanceCategory[] }>(apiPaths.settingsFinanceCategories),
		enabled: qs.ready
	}));

	const contactTypesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.contactTypes(),
		queryFn: () => apiGet<{ items: ContactType[] }>(apiPaths.settingsContactTypes),
		enabled: qs.ready
	}));

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>(apiPaths.tenantsCurrent),
		enabled: qs.ready
	}));

	const contacts = $derived(contactsQuery.data?.items ?? []);
	const categories = $derived(categoriesQuery.data?.items ?? []);
	const contactTypes = $derived(contactTypesQuery.data?.items ?? []);
	const baseCurrency = $derived(tenantQuery.data?.base_currency ?? 'TRY');
	const tenantTimezone = $derived(tenantQuery.data?.timezone ?? DEFAULT_TENANT_TIMEZONE);
	/** Onay bekleyen kayıt önerisi sayısı — köprü bağlantısı için. */
	const suggestionsQuery = createQuery(() => ({
		queryKey: qs.keys.recordUpdateSuggestions.list({ status: 'pending', for: 'badge' }),
		queryFn: () =>
			apiGet<{ items: unknown[] }>(listUrl('record-suggestions', { status: 'pending', limit: 50 })),
		enabled: qs.ready
	}));
	const pendingSuggestionCount = $derived(suggestionsQuery.data?.items.length ?? 0);

	/*
	 * VIZIT-01 — onay bekleyen vizit önerileri. Kuyrukta duruyorlar çünkü mesajdan
	 * çıkarılmış bir vizit KESİN KAYIT DEĞİL: kullanıcı alanları düzeltip onaylayana
	 * kadar `contact_visits`'e hiçbir şey yazılmaz (AGENTS ilke 6).
	 */
	const visitSuggestionsQuery = createQuery(() => ({
		queryKey: qs.keys.contactVisitSuggestions.list({ status: 'pending' }),
		queryFn: () =>
			apiGet<{ items: ContactVisitSuggestion[] }>(
				`${apiPaths.contactVisitSuggestions}?status=pending&limit=50`
			),
		enabled: qs.ready
	}));
	const visitSuggestions = $derived(visitSuggestionsQuery.data?.items ?? []);

	type VisitEdit = {
		visit_type: ContactVisitType;
		arrivalDate: string;
		arrivalTime: string;
		departureDate: string;
		departureTime: string;
		hotel: string;
		clinic: string;
		treatment_plan: string;
	};
	/** Kart başına düzenlenebilir kopya; onayda bu hâli gönderilir. */
	let visitEdits = $state<Record<string, VisitEdit>>({});
	let visitActingId = $state<string | null>(null);
	let visitError = $state<string | null>(null);

	const VISIT_TYPES = contactVisitTypeSchema.options;

	function splitIso(iso: string | null, timeKnown: boolean): { date: string; time: string } {
		if (!iso) return { date: '', time: '' };
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return { date: '', time: '' };
		const pad = (n: number) => String(n).padStart(2, '0');
		return {
			date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
			time: timeKnown ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : ''
		};
	}

	function joinIso(date: string, time: string): { at: string | null; known: boolean } {
		if (!date) return { at: null, known: false };
		return { at: `${date}T${time || '00:00'}:00.000Z`, known: time.length > 0 };
	}

	// Yeni gelen öneriler için taslak kopyası kur; kullanıcının yazdığı ezilmesin.
	$effect(() => {
		for (const s of visitSuggestions) {
			if (visitEdits[s.id]) continue;
			const a = splitIso(s.draft.arrival_at, s.draft.arrival_time_known);
			const d = splitIso(s.draft.departure_at, s.draft.departure_time_known);
			visitEdits[s.id] = {
				visit_type: s.draft.visit_type,
				arrivalDate: a.date,
				arrivalTime: a.time,
				departureDate: d.date,
				departureTime: d.time,
				hotel: s.draft.hotel ?? '',
				clinic: s.draft.clinic ?? '',
				treatment_plan: s.draft.treatment_plan ?? ''
			};
		}
	});

	function visitPayload(edit: VisitEdit): ContactVisitCreate {
		const a = joinIso(edit.arrivalDate, edit.arrivalTime);
		const d = joinIso(edit.departureDate, edit.departureTime);
		const bos = (x: string) => (x.trim().length > 0 ? x.trim() : null);
		return {
			visit_type: edit.visit_type,
			arrival_at: a.at,
			arrival_time_known: a.known,
			departure_at: d.at,
			departure_time_known: d.known,
			hotel: bos(edit.hotel),
			clinic: bos(edit.clinic),
			treatment_plan: bos(edit.treatment_plan),
			status: 'planned'
		};
	}

	async function approveVisit(suggestion: ContactVisitSuggestion) {
		const edit = visitEdits[suggestion.id];
		if (!edit) return;
		visitActingId = suggestion.id;
		visitError = null;
		try {
			await apiSend(apiPaths.contactVisitSuggestionApprove(suggestion.id), 'POST', {
				visit: visitPayload(edit)
			});
			await queryClient.invalidateQueries({ queryKey: qs.keys.contactVisitSuggestions.all() });
			await queryClient.invalidateQueries({
				queryKey: qs.keys.contacts.visits(suggestion.contact_id)
			});
			await queryClient.invalidateQueries({
				queryKey: qs.keys.contacts.summary(suggestion.contact_id)
			});
		} catch (err) {
			visitError = err instanceof Error ? err.message : t('finance.ai.visit.approveFailed');
		} finally {
			visitActingId = null;
		}
	}

	async function rejectVisit(suggestion: ContactVisitSuggestion) {
		visitActingId = suggestion.id;
		visitError = null;
		try {
			await apiSend(apiPaths.contactVisitSuggestionReject(suggestion.id), 'POST', {});
			await queryClient.invalidateQueries({ queryKey: qs.keys.contactVisitSuggestions.all() });
		} catch (err) {
			visitError = err instanceof Error ? err.message : t('finance.ai.visit.rejectFailed');
		} finally {
			visitActingId = null;
		}
	}

	/*
	 * Toplu karar. Canlıda kuyrukta 400'ün üzerinde öneri birikti; tek tek onay
	 * telefondan yapılabilir bir iş değil. Onay iletişim kutusu `confirm()` değil
	 * çünkü tarayıcı kutusu kaç öneriyi etkilediğini biçimli anlatamıyor ve
	 * gömülü/WebView bağlamlarında sessizce yutulabiliyor.
	 */
	const visitConfidenceTone: Record<
		ContactVisitSuggestionConfidence,
		'success' | 'warning' | 'neutral'
	> = { high: 'success', medium: 'warning', low: 'neutral' };

	const highConfidenceCount = $derived(
		visitSuggestions.filter((s) => s.confidence === 'high').length
	);

	let visitBulkKind = $state<'approve' | 'reject'>('approve');
	/** Dialog kendi içinde kapanabiliyor (Esc / arka plan) — `bind:open` şart. */
	let visitBulkOpen = $state(false);
	let visitBulkBusy = $state(false);
	let visitBulkResult = $state<string | null>(null);

	function openVisitBulk(kind: 'approve' | 'reject') {
		visitBulkKind = kind;
		visitBulkResult = null;
		visitBulkOpen = true;
	}

	async function runVisitBulk() {
		const kind = visitBulkKind;
		if (visitBulkBusy) return;
		visitBulkBusy = true;
		visitError = null;
		visitBulkResult = null;
		try {
			if (kind === 'approve') {
				const r = await apiSend<ContactVisitSuggestionApproveAllResult>(
					apiPaths.contactVisitSuggestionsApproveAll,
					'POST',
					{ min_confidence: 'high', limit: 500 }
				);
				visitBulkResult = t('finance.ai.visit.bulk.approved', {
					approved: String(r.approved),
					skipped: String(r.skipped),
					failed: String(r.failed)
				});
			} else {
				// Eşik `low`: "kalanlar" kuyrukta bekleyen her şey. Kutudaki sayı da öyle.
				const r = await apiSend<ContactVisitSuggestionRejectAllResult>(
					apiPaths.contactVisitSuggestionsRejectAll,
					'POST',
					{ min_confidence: 'low', limit: 500 }
				);
				visitBulkResult = t('finance.ai.visit.bulk.rejected', {
					rejected: String(r.rejected),
					failed: String(r.failed)
				});
			}
			visitBulkOpen = false;
			// Toplu onay birçok kişinin vizitini/özetini değiştirir — kişi ağacının
			// tamamı tazelenir, tek tek kimlik toplamaya değmez.
			await queryClient.invalidateQueries({ queryKey: qs.keys.contactVisitSuggestions.all() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.all() });
		} catch (err) {
			visitError = err instanceof Error ? err.message : t('finance.ai.visit.bulk.failed');
			visitBulkOpen = false;
		} finally {
			visitBulkBusy = false;
		}
	}

	const bekleyenler = $derived(
		(inboxQuery.data?.messages ?? []).filter((m) => m.status === 'new' || m.status === 'parsed')
	);
	/**
	 * Tür süzgeci. Tek gelen kutusu var (ekran çoğaltmak yerine): mesajlar
	 * para / randevu / kişi diye etiketleniyor, süzgeç yalnız görünümü daraltıyor.
	 * `null` = hepsi. Türü anlaşılmamış mesajlar ('other') ayrı seçenek — onlar
	 * gözden kaçmasın.
	 */
	let kindFilter = $state<InboundMessageKind | 'other' | null>(null);

	function kindsOf(m: { message_kinds?: InboundMessageKind[] }): InboundMessageKind[] {
		return m.message_kinds ?? [];
	}

	const kindCounts = $derived.by(() => {
		const out = { finance: 0, appointment: 0, contact: 0, other: 0 };
		for (const m of bekleyenler) {
			const kinds = kindsOf(m);
			if (kinds.length === 0) out.other += 1;
			for (const k of kinds) out[k] += 1;
		}
		return out;
	});

	const pendingMessages = $derived(
		kindFilter === null
			? bekleyenler
			: kindFilter === 'other'
				? bekleyenler.filter((m) => kindsOf(m).length === 0)
				: bekleyenler.filter((m) => kindsOf(m).includes(kindFilter as InboundMessageKind))
	);
	const pendingCount = $derived(bekleyenler.filter((m) => m.status === 'new').length);

	/*
	 * KISI-01 adım 4: kuyruk kişiye göre. Kullanıcı kararı (2026-09-15): çapa kişi.
	 * Mesaj birden fazla kişiden bahsediyorsa her birinin altında görünür; kişisiz
	 * mesajlar (kira, taksit, sohbet) en sonda tek kümede. Kümeler son mesaja göre
	 * sıralı: en taze konu üstte. Onay/yoksay satırı düşürünce kümeden de düşer.
	 */
	type KisiKumesi = {
		key: string;
		name: string;
		contactId: string | null;
		items: InboundMessage[];
		finance: number;
		newest: string;
	};
	let groupMode = $state<'contact' | 'flat'>('contact');
	let expandedGroups = $state<Set<string>>(new Set());
	function toggleGroup(key: string) {
		const next = new Set(expandedGroups);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		expandedGroups = next;
	}
	const contactGroups = $derived.by((): KisiKumesi[] => {
		const map = new Map<string, KisiKumesi>();
		const push = (key: string, name: string, contactId: string | null, m: InboundMessage) => {
			const g = map.get(key) ?? { key, name, contactId, items: [], finance: 0, newest: '' };
			g.items.push(m);
			if (kindsOf(m).includes('finance')) g.finance += 1;
			if (m.created_at > g.newest) g.newest = m.created_at;
			map.set(key, g);
		};
		for (const m of pendingMessages) {
			if (m.contacts.length === 0) push('__none', t('finance.ai.group.noContact'), null, m);
			else for (const c of m.contacts) push(c.id, c.display_name, c.id, m);
		}
		const list = [...map.values()].sort((a, b) => b.newest.localeCompare(a.newest));
		const none = list.find((g) => g.key === '__none');
		return none ? [...list.filter((g) => g !== none), none] : list;
	});

	/**
	 * Taslağın işlem tarihi boş gelirse mesajın günü yazılır — analizin yapıldığı
	 * gün değil. Sunucu da aynı varsayılanı üretir; bu, eski (tarihi boş yazılmış)
	 * taslaklar için ikinci ağdır.
	 */
	function initDrafts(records: TransactionDraft[], messageDate: string): DraftState[] {
		return records.map((r) => {
			const same = r.currency === baseCurrency;
			return {
				...r,
				occurred_on: r.occurred_on?.trim() ? r.occurred_on : messageDate,
				status: null,
				paid_amount: null,
				fx_rate: same ? 1 : null,
				amount_base: same ? r.amount : (r.counterparty_amount ?? null),
				/*
				 * Sunucunun doldurduğu alanlar korunur. Eskiden üçü de körlemesine
				 * null yazılıyordu: modelin bulduğu kişi ve sunucunun mesaj bağından
				 * çıkardığı hasta önerisi kartta hiç görünmüyordu.
				 */
				contact_id: r.contact_id ?? null,
				case_contact_id: r.case_contact_id ?? null,
				responsible_contact_id: r.responsible_contact_id ?? null,
				/*
				 * PARA-01 — vizit taslakta yok, kart kendi önerir (işlem günü tek bir
				 * vizitin penceresine düşüyorsa). Boş bırakılırsa onayda sunucu aynı
				 * kuralla eşleştirir.
				 */
				contact_visit_id: null,
				invoice_status: 'none' as const,
				_status: 'idle' as const,
				_error: null
			};
		});
	}

	/** Mesajın günü (tenant saat dilimi); serbest metin yapıştırıldıysa bugün. */
	function messageDayKey(item?: InboundMessage | null): string {
		const at = item?.created_at ? new Date(item.created_at) : new Date();
		return toTenantDayKey(Number.isNaN(at.getTime()) ? new Date() : at, tenantTimezone);
	}

	function setDrafts(records: TransactionDraft[], item?: InboundMessage | null) {
		originalDrafts = records;
		drafts = initDrafts(records, messageDayKey(item));
	}

	function draftReady(d: DraftState): boolean {
		const item = {
			kind: d.kind,
			amount: d.amount,
			currency: d.currency,
			counterparty_amount: d.counterparty_amount,
			title: d.title,
			category: d.category,
			subcategory: d.subcategory,
			contact_id: d.contact_id,
			contact_display_name: d.contact_display_name,
			contact_label: d.contact_label,
			occurred_on: d.occurred_on,
			payment_method: d.payment_method,
			description: d.description,
			status: d.status,
			paid_amount: d.paid_amount,
			fx_rate: d.fx_rate,
			amount_base: d.amount_base,
			case_contact_id: d.case_contact_id,
			responsible_contact_id: d.responsible_contact_id,
			contact_visit_id: d.contact_visit_id,
			invoice_status: d.invoice_status
		};
		return approveDraftItemSchema.safeParse(item).success;
	}

	const canApprove = $derived(
		Boolean(activeInboxId) && drafts.length > 0 && drafts.every(draftReady) && !approving
	);

	const highlightParts = $derived(locateEvidenceQuote(message, evidenceHighlight));

	$effect(() => {
		const inboxId = page.url.searchParams.get('inbox');
		if (!inboxId || inboxId === activeInboxId) return;

		// İşlem detayından gelen kaynak bağı onaylanmış mesajı da açabilir.
		// O mesaj yeniden onaylanamaz: `activeInboxId` bilinçli olarak boş
		// bırakılır — onay butonu ona bağlı, mükerrer kayıt yolu kapalı.
		const item = pendingMessages.find((m) => m.id === inboxId);
		if (!item) {
			const archived = (inboxQuery.data?.messages ?? []).find((m) => m.id === inboxId);
			if (!archived || viewingApprovedSource) return;
			viewingApprovedSource = true;
			activeInboxId = null;
			message = archived.body ?? '';
			originalDrafts = [];
			drafts = [];
			return;
		}

		viewingApprovedSource = false;
		activeInboxId = inboxId;
		message = item.body ?? '';
		if (item.parsed_records && item.parsed_records.length > 0) {
			setDrafts(item.parsed_records, item);
		} else {
			originalDrafts = [];
			drafts = [];
		}
	});

	async function analyzeText(text: string) {
		parsing = true;
		parseError = null;
		try {
			const res = await apiSend<{ records: TransactionDraft[] }>(apiPaths.whatsappParse, 'POST', {
				message: text
			});
			setDrafts(res.records);
			if (res.records.length === 0) parseError = t('finance.ai.parse.none');
		} catch (err) {
			parseError = err instanceof Error ? err.message : t('finance.ai.parse.failed');
			drafts = [];
			originalDrafts = [];
		} finally {
			parsing = false;
		}
	}

	function requestAnalyze() {
		if (!message.trim()) return;
		if (message.length > 600) {
			showLongWarning = true;
			return;
		}
		activeInboxId = null;
		void analyzeText(message);
	}

	async function analyzeInboxItem(item: InboundMessage) {
		activeInboxId = item.id;
		message = item.body ?? '';
		parsing = true;
		parseError = null;
		try {
			const res = await apiSend<{ records: TransactionDraft[] }>(
				apiPaths.whatsappInboxParse(item.id),
				'POST'
			);
			setDrafts(res.records, item);
			if (res.records.length === 0) {
				parseError = item.has_media ? t('finance.ai.parse.media') : t('finance.ai.parse.none');
			}
			await queryClient.invalidateQueries({ queryKey: qs.keys.whatsapp.inbox() });
		} catch (err) {
			parseError = err instanceof Error ? err.message : t('finance.ai.parse.failed');
			drafts = [];
			originalDrafts = [];
		} finally {
			parsing = false;
		}
	}

	async function processNewMessages() {
		processing = true;
		try {
			await apiSend(apiPaths.whatsappInboxProcess, 'POST');
			await queryClient.invalidateQueries({ queryKey: qs.keys.whatsapp.inbox() });
		} finally {
			processing = false;
		}
	}

	/**
	 * KISI-01: geçmiş mesajları kişilere yeniden bağla. Yeni mesaj gelirken bağ
	 * zaten kuruluyor; bu düğme yeni kişi eklendiğinde ya da kural düzeldiğinde
	 * geçmişi taramak için.
	 */
	let linking = $state(false);
	let linkResult = $state<string | null>(null);
	async function linkContacts() {
		linking = true;
		linkResult = null;
		try {
			const r = await apiSend<InboundMessageLinkContactsResponse>(
				apiPaths.whatsappInboxLinkContacts,
				'POST'
			);
			linkResult = t('finance.ai.pending.linked', { processed: r.processed, linked: r.linked });
			await queryClient.invalidateQueries({ queryKey: qs.keys.whatsapp.inbox() });
		} finally {
			linking = false;
		}
	}

	/*
	 * "Kişi bilgisi" mesajından yeni kişi. Model yalnız formu doldurur (ad / e-posta /
	 * telefon mesajdan); kişiyi insan açar. Kaydedince mesaj ve 3 dk içindeki görselleri
	 * kişiye bağlanır — bilet görselleri akışa düşer.
	 */
	let newContactFor = $state<string | null>(null);
	let newContact = $state({ first_name: '', last_name: '', email: '', phone: '' });
	let creatingFromMessage = $state(false);
	let newContactError = $state<string | null>(null);
	let newContactDone = $state<string | null>(null);

	function openNewContact(item: InboundMessage) {
		newContactFor = item.id;
		newContactError = null;
		newContact = {
			first_name: item.contact_hint?.first_name ?? '',
			last_name: item.contact_hint?.last_name ?? '',
			email: item.contact_hint?.email ?? '',
			phone: item.contact_hint?.phone ?? ''
		};
	}

	async function submitNewContact(item: InboundMessage) {
		const type =
			contactTypes.find((ct) => ct.name.trim().toLocaleLowerCase('tr') === 'hasta') ??
			contactTypes[0];
		if (!type) {
			newContactError = t('finance.ai.pending.createContactNoType');
			return;
		}
		if (!newContact.first_name.trim()) {
			newContactError = t('finance.ai.pending.createContactNeedName');
			return;
		}
		creatingFromMessage = true;
		newContactError = null;
		try {
			const r = await apiSend<InboundMessageCreateContactResponse>(
				apiPaths.whatsappInboxCreateContact(item.id),
				'POST',
				{
					first_name: newContact.first_name.trim(),
					last_name: newContact.last_name.trim() || null,
					contact_type_id: type.id,
					email: newContact.email.trim() || null,
					phone: newContact.phone.trim() || null
				}
			);
			newContactDone = t('finance.ai.pending.createContactDone', {
				name: r.contact.display_name,
				count: r.linked_messages
			});
			newContactFor = null;
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.all() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.whatsapp.inbox() });
		} catch (err) {
			newContactError =
				err instanceof Error ? err.message : t('finance.ai.pending.createContactFailed');
		} finally {
			creatingFromMessage = false;
		}
	}

	/** KISI-01/KUCUK-01: bağı hangi kural kurdu — rozetin başlığı ("yakın eşleşme"). */
	function contactMethodLabel(method: InboundMessageContactRef['method']): string {
		return t(`finance.ai.pending.contactMethod.${method}`);
	}

	/*
	 * KUCUK-01 — "Yeni randevu oluştur".
	 *
	 * Mesaj klinik randevu talebi taşıyor ve tarihi okunabiliyorsa sunucu
	 * `appointment_hint` üretiyor (`randevu-ipucu.ts`). Düğme mevcut randevu
	 * formunu ÖN DOLU açar: kişi mesajın bağlı kişisi, tarih/saat ipucundan, not
	 * mesaj metni. Randevu türünü kullanıcı seçer. KESİN KAYIT yalnız kullanıcı
	 * kaydedince oluşur — düğme hiçbir şey yazmaz (AGENTS ilke 6).
	 */
	let appointmentFor = $state<InboundMessage | null>(null);
	let appointmentOpen = $state(false);
	let appointmentSaving = $state(false);
	let appointmentError = $state<string | null>(null);
	let appointmentDone = $state<string | null>(null);

	function openAppointment(item: InboundMessage) {
		appointmentFor = item;
		appointmentError = null;
		appointmentDone = null;
		appointmentOpen = true;
	}

	async function saveAppointment(data: AppointmentCreate | AppointmentUpdate) {
		appointmentSaving = true;
		appointmentError = null;
		try {
			await apiSend(apiPaths.appointments, 'POST', data);
			appointmentDone = t('finance.ai.pending.newAppointmentDone', {
				name:
					appointmentFor?.contacts.find((c) => c.id === data.contact_id)?.display_name ??
					t('finance.ai.pending.newAppointment')
			});
			appointmentOpen = false;
			appointmentFor = null;
			await queryClient.invalidateQueries({ queryKey: qs.keys.appointments.all() });
		} catch (err) {
			appointmentError =
				err instanceof Error ? err.message : t('finance.ai.pending.newAppointmentFailed');
		} finally {
			appointmentSaving = false;
		}
	}

	/**
	 * Sunucu cevap verdi; listeyi yeniden çekmeyi beklemeden satırı düşür.
	 * Yeniden çekme 5 sayfaya kadar istek atıyor, o sürede satır yerinde
	 * duruyor ve "Yoksay basıldı ama gitmedi" gibi görünüyordu.
	 */
	function dropFromInboxCache(id: string) {
		queryClient.setQueryData<{ messages: InboundMessage[] }>(qs.keys.whatsapp.inbox(), (old) =>
			old ? { messages: old.messages.filter((m) => m.id !== id) } : old
		);
	}

	async function ignoreInbox(id: string) {
		await apiSend(apiPaths.whatsappInboxIgnore(id), 'POST');
		dropFromInboxCache(id);
		if (activeInboxId === id) {
			activeInboxId = null;
			message = '';
			drafts = [];
			originalDrafts = [];
		}
		await queryClient.invalidateQueries({ queryKey: qs.keys.whatsapp.inbox() });
	}

	function updateDraft(index: number, patch: Partial<DraftState>) {
		drafts = drafts.map((d, i) => (i === index ? { ...d, ...patch } : d));
	}

	function toApproveItem(d: DraftState): ApproveDraftItem {
		const parsed = approveDraftItemSchema.parse({
			kind: d.kind,
			amount: d.amount,
			currency: d.currency,
			counterparty_amount: d.counterparty_amount,
			title: d.title,
			category: d.category,
			subcategory: d.subcategory,
			contact_id: d.contact_id,
			contact_display_name: d.contact_display_name,
			contact_label: d.contact_label,
			occurred_on: d.occurred_on,
			payment_method: d.payment_method,
			description: d.description,
			status: d.status,
			paid_amount: d.paid_amount,
			fx_rate: d.fx_rate,
			amount_base: d.amount_base,
			case_contact_id: d.case_contact_id,
			responsible_contact_id: d.responsible_contact_id,
			contact_visit_id: d.contact_visit_id,
			invoice_status: d.invoice_status
		});
		return parsed;
	}

	async function createContactInline(
		index: number,
		input: {
			first_name: string;
			last_name?: string | null;
			contact_type_id: string;
			phone?: string | null;
			email?: string | null;
		}
	) {
		creatingInline = true;
		try {
			const created = await apiSend<Contact>(apiPaths.whatsappCreateContact, 'POST', input);
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.all() });
			updateDraft(index, {
				contact_id: created.id,
				contact_display_name: created.display_name,
				contact_label: created.display_name
			});
		} finally {
			creatingInline = false;
		}
	}

	async function createCategoryInline(
		index: number,
		input: { name: string; kind: TransactionDraft['kind'] }
	) {
		creatingInline = true;
		try {
			const created = await apiSend<FinanceCategory>(
				apiPaths.whatsappCreateCategory,
				'POST',
				input
			);
			await queryClient.invalidateQueries({
				queryKey: qs.keys.settings.financeCategories()
			});
			updateDraft(index, { category: created.name });
		} finally {
			creatingInline = false;
		}
	}

	async function approveAll() {
		if (!activeInboxId || !canApprove) return;
		approving = true;
		parseError = null;
		drafts = drafts.map((d) => ({ ...d, _status: 'saving', _error: null }));
		try {
			const items = drafts.map(toApproveItem);
			await apiSend<ApproveDraftsResponse>(
				apiPaths.whatsappInboxApproveDrafts(activeInboxId),
				'POST',
				{
					drafts: items,
					original_parsed: originalDrafts.length > 0 ? originalDrafts : undefined
				}
			);
			drafts = drafts.map((d) => ({ ...d, _status: 'saved', _error: null }));
			await queryClient.invalidateQueries({ queryKey: qs.keys.transactions.all() });
			dropFromInboxCache(activeInboxId);
			await queryClient.invalidateQueries({ queryKey: qs.keys.whatsapp.inbox() });
			activeInboxId = null;
			message = '';
			drafts = [];
			originalDrafts = [];
		} catch (err) {
			const msg = err instanceof Error ? err.message : t('finance.ai.approve.failed');
			parseError = msg;
			drafts = drafts.map((d) => ({ ...d, _status: 'error', _error: msg }));
		} finally {
			approving = false;
		}
	}

	function previewBody(item: InboundMessage): string {
		if (item.body?.trim()) return item.body;
		return item.has_media ? t('finance.ai.pending.emptyBody') : '—';
	}
</script>

<svelte:head>
	<title>{t('finance.ai.title')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<PageHeader title={t('finance.ai.title')} description={t('finance.ai.description')} />

	<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
		<h2 class="mb-3 text-sm font-semibold text-text">{t('finance.ai.paste.heading')}</h2>
		<textarea
			class="min-h-28 w-full resize-y rounded-[6px] border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40"
			placeholder={t('finance.ai.paste.placeholder')}
			bind:value={message}
			rows={6}></textarea>

		{#if viewingApprovedSource}
			<p class="mt-2 text-sm text-text-muted">{t('finance.ai.source.approvedNotice')}</p>
		{/if}

		{#if evidenceHighlight}
			<div class="mt-3 rounded-lg border border-brand/30 bg-brand/5 p-3">
				<div class="mb-1 flex items-center justify-between gap-2">
					<span class="text-xs font-semibold text-text-muted">
						{t('finance.ai.evidence.heading')}
					</span>
					<button
						type="button"
						class="cursor-pointer text-xs text-text-muted underline-offset-2 hover:underline"
						onclick={() => (evidenceHighlight = null)}
					>
						{t('finance.ai.evidence.close')}
					</button>
				</div>
				<p class="text-sm break-words whitespace-pre-wrap text-text">
					{#if highlightParts}
						{highlightParts.before}<mark class="rounded bg-warning/40 px-0.5 text-text"
							>{highlightParts.match}</mark
						>{highlightParts.after}
					{:else}
						<span class="text-text-muted">{t('finance.ai.evidence.notFound')}</span>
						„{evidenceHighlight.quote}“
					{/if}
				</p>
			</div>
		{/if}

		{#if parseError && !activeInboxId}
			<p class="mt-2 text-sm text-danger">{parseError}</p>
		{/if}

		{#if showLongWarning}
			<div class="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
				<p class="text-text">{t('finance.ai.paste.longWarning')}</p>
				<div class="mt-2 flex gap-2">
					<Button
						size="sm"
						type="button"
						onclick={() => {
							showLongWarning = false;
							void analyzeText(message);
						}}
					>
						{t('finance.ai.paste.tryAnyway')}
					</Button>
					<Button
						size="sm"
						variant="outline"
						type="button"
						onclick={() => (showLongWarning = false)}
					>
						{t('finance.ai.paste.cancel')}
					</Button>
				</div>
			</div>
		{/if}

		<div class="mt-3 flex flex-wrap items-center gap-2">
			<Button type="button" disabled={parsing || !message.trim()} onclick={requestAnalyze}>
				<Sparkles class="size-4" />
				{parsing ? t('finance.ai.analyzing') : t('finance.ai.analyze')}
			</Button>
			{#if activeInboxId}
				<span class="text-xs text-text-faint">{t('finance.ai.fromQueue')}</span>
			{/if}
		</div>
	</section>

	<!--
		VIZIT-01 — vizit önerileri. Öneri yoksa bölüm hiç çizilmez: boş başlık
		kuyruğu uzatmaktan başka bir şey yapmaz.
	-->
	{#if visitSuggestions.length > 0 || visitBulkResult}
		<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
			<div class="mb-1 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">
					{t('finance.ai.visit.heading')}
					<span class="font-normal text-text-muted">({visitSuggestions.length})</span>
				</h2>
			</div>
			{#if visitSuggestions.length > 0}
				<p class="mb-3 text-xs text-text-muted">{t('finance.ai.visit.subtitle')}</p>
			{/if}

			<!--
				Toplu karar düğmeleri listenin ÜSTÜNDE: 400 öneride listenin sonuna
				inmek mobilde dakikalar sürüyor.
			-->
			{#if visitSuggestions.length > 0}
				<div class="mb-3 flex flex-wrap gap-2">
					{#if highConfidenceCount > 0}
						<Button
							type="button"
							size="sm"
							disabled={visitBulkBusy}
							onclick={() => openVisitBulk('approve')}
						>
							{visitBulkBusy && visitBulkKind === 'approve'
								? t('finance.ai.visit.bulk.working')
								: t('finance.ai.visit.bulk.approveHigh', { count: String(highConfidenceCount) })}
						</Button>
					{/if}
					<Button
						type="button"
						size="sm"
						variant="ghost"
						disabled={visitBulkBusy}
						onclick={() => openVisitBulk('reject')}
					>
						{visitBulkBusy && visitBulkKind === 'reject'
							? t('finance.ai.visit.bulk.working')
							: t('finance.ai.visit.bulk.rejectRest', { count: String(visitSuggestions.length) })}
					</Button>
				</div>
			{/if}

			{#if visitBulkResult}
				<p class="mb-3 text-sm text-text-muted" role="status">{visitBulkResult}</p>
			{/if}

			{#if visitError}
				<p class="mb-3 text-sm text-danger">{visitError}</p>
			{/if}

			<ul class="space-y-3">
				{#each visitSuggestions as s (s.id)}
					{@const edit = visitEdits[s.id]}
					<li class="rounded-lg border border-border bg-surface-2 p-3">
						<div class="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
							<a
								href={`/contacts/${s.contact_id}`}
								class="text-sm font-semibold text-text hover:underline"
							>
								{s.contact_display_name}
							</a>
							<StatusBadge
								tone={visitConfidenceTone[s.confidence]}
								label={s.confidence === 'high'
									? t('finance.ai.visit.confidence.high')
									: s.confidence === 'medium'
										? t('finance.ai.visit.confidence.medium')
										: t('finance.ai.visit.confidence.low')}
							/>
						</div>

						{#if edit}
							<div class="grid gap-2 sm:grid-cols-2">
								<label class="block">
									<span class="mb-1 block text-[11px] leading-4 text-text-muted">
										{t('contacts.visits.type')}
									</span>
									<select class={fieldClass} bind:value={edit.visit_type}>
										{#each VISIT_TYPES as ty (ty)}
											<option value={ty}>{contactVisitTypeLabels[ty]}</option>
										{/each}
									</select>
								</label>
								<label class="block">
									<span class="mb-1 block text-[11px] leading-4 text-text-muted">
										{t('contacts.visits.clinic')}
									</span>
									<input class={fieldClass} type="text" bind:value={edit.clinic} maxlength={255} />
								</label>
								<div>
									<span class="mb-1 block text-[11px] leading-4 text-text-muted">
										{t('contacts.visits.arrival')}
									</span>
									<div class="flex gap-2">
										<input
											class={fieldClass}
											type="date"
											bind:value={edit.arrivalDate}
											aria-label={t('contacts.visits.arrival')}
										/>
										<input
											class={fieldClass}
											style="max-width: 7rem"
											type="time"
											bind:value={edit.arrivalTime}
											aria-label={t('contacts.visits.arrival')}
										/>
									</div>
								</div>
								<div>
									<span class="mb-1 block text-[11px] leading-4 text-text-muted">
										{t('contacts.visits.departure')}
									</span>
									<div class="flex gap-2">
										<input
											class={fieldClass}
											type="date"
											bind:value={edit.departureDate}
											aria-label={t('contacts.visits.departure')}
										/>
										<input
											class={fieldClass}
											style="max-width: 7rem"
											type="time"
											bind:value={edit.departureTime}
											aria-label={t('contacts.visits.departure')}
										/>
									</div>
								</div>
								<label class="block">
									<span class="mb-1 block text-[11px] leading-4 text-text-muted">
										{t('contacts.visits.hotel')}
									</span>
									<input class={fieldClass} type="text" bind:value={edit.hotel} maxlength={255} />
								</label>
								<label class="block">
									<span class="mb-1 block text-[11px] leading-4 text-text-muted">
										{t('contacts.visits.treatmentPlan')}
									</span>
									<input
										class={fieldClass}
										type="text"
										bind:value={edit.treatment_plan}
										maxlength={300}
									/>
								</label>
							</div>
						{/if}

						<details class="mt-2">
							<summary class="cursor-pointer text-[11px] leading-4 text-text-faint">
								{t('finance.ai.visit.source')}
							</summary>
							<p class="mt-1 text-xs break-words whitespace-pre-wrap text-text-muted">
								{s.source_text}
							</p>
						</details>

						<div class="mt-3 flex flex-wrap gap-2">
							<Button
								type="button"
								size="sm"
								disabled={visitActingId === s.id}
								onclick={() => approveVisit(s)}
							>
								{visitActingId === s.id
									? t('finance.ai.visit.approving')
									: t('finance.ai.visit.approve')}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={visitActingId === s.id}
								onclick={() => rejectVisit(s)}
							>
								{t('finance.ai.visit.reject')}
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		</section>

		<Dialog
			bind:open={visitBulkOpen}
			title={visitBulkKind === 'reject'
				? t('finance.ai.visit.bulk.rejectTitle')
				: t('finance.ai.visit.bulk.approveTitle')}
		>
			<p class="text-sm text-text-muted">
				{visitBulkKind === 'reject'
					? t('finance.ai.visit.bulk.rejectBody', { count: String(visitSuggestions.length) })
					: t('finance.ai.visit.bulk.approveBody', { count: String(highConfidenceCount) })}
			</p>
			{#snippet footer()}
				<Button
					type="button"
					variant="ghost"
					disabled={visitBulkBusy}
					onclick={() => (visitBulkOpen = false)}
				>
					{t('finance.ai.visit.bulk.cancel')}
				</Button>
				<Button type="button" disabled={visitBulkBusy} onclick={runVisitBulk}>
					{visitBulkBusy
						? t('finance.ai.visit.bulk.working')
						: visitBulkKind === 'reject'
							? t('finance.ai.visit.bulk.rejectConfirm')
							: t('finance.ai.visit.bulk.approveConfirm')}
				</Button>
			{/snippet}
		</Dialog>
	{/if}

	<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<h2 class="text-sm font-semibold text-text">
				{t('finance.ai.pending.heading')}
				{#if pendingCount > 0}
					<span class="font-normal text-text-muted">({pendingCount})</span>
				{/if}
			</h2>
			<div class="flex flex-wrap items-center gap-2">
				<!--
					Randevu/otel önerileri bu ekranda onaylanmıyor: randevu formuna
					düşüyorlar. Kuyruk boş değilse bağlantı görünür — iki ekran arasında
					köprü yoktu, öneriler kimsenin bakmadığı yerde birikiyordu.
				-->
				{#if pendingSuggestionCount > 0}
					<a
						href={resolve('/appointments/suggestions')}
						class="inline-flex h-9 items-center rounded-[6px] border border-warning/40 bg-warning/10 px-3 text-sm font-medium text-text hover:bg-warning/15"
					>
						{t('appointments.suggestionsPending', { count: String(pendingSuggestionCount) })}
					</a>
				{/if}
				<Button
					variant="outline"
					size="sm"
					type="button"
					disabled={processing}
					onclick={processNewMessages}
				>
					{processing ? t('finance.ai.pending.processing') : t('finance.ai.pending.process')}
				</Button>
				<Button variant="ghost" size="sm" type="button" disabled={linking} onclick={linkContacts}>
					{linking ? t('finance.ai.pending.linking') : t('finance.ai.pending.linkContacts')}
				</Button>
			</div>
		</div>
		{#if linkResult}
			<p class="mb-3 text-xs text-text-muted">{linkResult}</p>
		{/if}
		{#if appointmentDone}
			<p class="mb-3 text-xs text-text-muted">{appointmentDone}</p>
		{/if}
		{#if newContactDone}
			<p class="mb-3 text-xs text-text-muted">{newContactDone}</p>
		{/if}

		<!--
			Tür süzgeci: tek gelen kutusu, üç konu. Ayrı ekran açmak yerine süzgeç,
			çünkü çalışan mesaj gelmeden konusunu bilmiyor; üç ekranı gezmek zorunda
			kalırsa biri unutulur.
		-->
		{#if bekleyenler.length > 0}
			<div class="mb-3 flex flex-wrap items-center gap-1.5">
				<button
					type="button"
					class="rounded-full border px-2.5 py-0.5 text-xs transition-colors {kindFilter === null
						? 'border-brand bg-brand-subtle text-text'
						: 'border-border text-text-muted hover:text-text'}"
					aria-pressed={kindFilter === null}
					onclick={() => (kindFilter = null)}
				>
					{t('finance.ai.kindFilter.all')} ({bekleyenler.length})
				</button>
				{#each ['finance', 'appointment', 'contact', 'other'] as const as k (k)}
					{#if kindCounts[k] > 0}
						<button
							type="button"
							class="rounded-full border px-2.5 py-0.5 text-xs transition-colors {kindFilter === k
								? 'border-brand bg-brand-subtle text-text'
								: 'border-border text-text-muted hover:text-text'}"
							aria-pressed={kindFilter === k}
							onclick={() => (kindFilter = k)}
						>
							{t(`finance.ai.kind.${k}`)} ({kindCounts[k]})
						</button>
					{/if}
				{/each}
				<span class="ml-auto flex items-center gap-1">
					{#each [['contact', 'finance.ai.group.byContact'], ['flat', 'finance.ai.group.flat']] as const as [mode, key] (mode)}
						<button
							type="button"
							class="rounded-full border px-2.5 py-0.5 text-xs transition-colors {groupMode === mode
								? 'border-brand bg-brand-subtle text-text'
								: 'border-border text-text-muted hover:text-text'}"
							aria-pressed={groupMode === mode}
							onclick={() => (groupMode = mode)}
						>
							{t(key)}
						</button>
					{/each}
				</span>
			</div>
		{/if}

		{#snippet mesajKarti(item: InboundMessage)}
			<li class="flex min-w-0 flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						<!--
									Grup adı varsa ad, yoksa gönderen kimliği. Ad Ayarlar > WhatsApp
									gruplarından gelir; WAHA webhook'ta göndermiyor.
								-->
						{#if item.chat_name}
							<span class="truncate text-xs font-medium text-text-muted">{item.chat_name}</span>
						{:else}
							<span class="truncate font-mono text-xs text-text-faint">{item.sender}</span>
						{/if}
						<StatusBadge
							label={inboundMessageStatusLabels[item.status]}
							tone={item.status === 'new' ? 'warning' : 'info'}
						/>
						{#each kindsOf(item) as k (k)}
							<StatusBadge
								label={t(`finance.ai.kind.${k}`)}
								tone={k === 'finance' ? 'info' : k === 'appointment' ? 'warning' : 'neutral'}
							/>
						{/each}
						{#if item.has_media}
							<StatusBadge label={t('finance.ai.pending.media')} tone="neutral" />
						{/if}
						{#if item.group_id}
							<StatusBadge label={t('finance.ai.pending.sameEvent')} tone="warning" />
						{/if}
						<!--
							Taslağı model değil kural tabanlı yedek üretti: kategori ve kişi
							alanları boş gelir. Kullanıcı "AI kategori bulmuyor" demeden önce
							bunu görsün — eksiklik modelin değil, yolun sonucudur.
						-->
						{#if item.parse_path === 'openai_compatible_fallback'}
							<StatusBadge label={t('finance.ai.pending.fallbackParse')} tone="neutral" />
						{/if}
						<!-- KISI-01: mesajın bahsettiği kişiler; tıklayınca kişi sayfası. -->
						{#each item.contacts as c (c.id)}
							<a
								href={resolve('/contacts/[id]', { id: c.id })}
								class="rounded-full border border-brand/40 bg-brand-subtle px-2 py-0.5 text-xs text-text hover:underline"
								title={contactMethodLabel(c.method)}
							>
								{c.display_name}
							</a>
						{/each}
						<time
							class="ml-auto text-xs whitespace-nowrap text-text-faint"
							datetime={item.created_at}
						>
							{formatDateTime(item.created_at)}
						</time>
					</div>
					<p class="mt-1 line-clamp-2 text-sm text-text">{previewBody(item)}</p>
					{#if item.media_thumbnail}
						<button
							type="button"
							class="mt-1 overflow-hidden rounded-md border border-border"
							title={item.media
								? t('contacts.timeline.openAttachment')
								: t('contacts.timeline.previewOnly')}
							onclick={() => void openInboundMedia(item)}
						>
							<img src={item.media_thumbnail} alt="" class="max-h-24 object-cover" />
						</button>
					{/if}
					{#if item.contact_hint && item.contacts.length === 0}
						{#if newContactFor === item.id}
							<form
								class="mt-2 rounded-md border border-border bg-surface-2 p-2"
								onsubmit={(e) => {
									e.preventDefault();
									void submitNewContact(item);
								}}
							>
								<p class="mb-2 text-xs text-text-muted">
									{t('finance.ai.pending.createContactHint')}
								</p>
								<div class="grid gap-2 sm:grid-cols-2">
									<input
										class="h-8 rounded-[6px] border border-border bg-surface px-2 text-sm"
										placeholder={t('finance.ai.pending.field.firstName')}
										bind:value={newContact.first_name}
									/>
									<input
										class="h-8 rounded-[6px] border border-border bg-surface px-2 text-sm"
										placeholder={t('finance.ai.pending.field.lastName')}
										bind:value={newContact.last_name}
									/>
									<input
										class="h-8 rounded-[6px] border border-border bg-surface px-2 text-sm"
										placeholder={t('finance.ai.pending.field.email')}
										bind:value={newContact.email}
									/>
									<input
										class="h-8 rounded-[6px] border border-border bg-surface px-2 text-sm"
										placeholder={t('finance.ai.pending.field.phone')}
										bind:value={newContact.phone}
									/>
								</div>
								<div class="mt-2 flex items-center gap-2">
									<Button size="sm" type="submit" disabled={creatingFromMessage}>
										{creatingFromMessage
											? t('finance.ai.pending.createContactSaving')
											: t('finance.ai.pending.createContactSave')}
									</Button>
									<Button
										size="sm"
										variant="ghost"
										type="button"
										onclick={() => (newContactFor = null)}
									>
										{t('finance.ai.pending.createContactCancel')}
									</Button>
									{#if newContactError}<span class="text-xs text-danger">{newContactError}</span
										>{/if}
								</div>
							</form>
						{:else}
							<button
								type="button"
								class="mt-1 text-xs font-medium text-brand hover:underline"
								onclick={() => openNewContact(item)}
							>
								{t('finance.ai.pending.createContact')}
							</button>
						{/if}
					{/if}
					<!--
						KUCUK-01: mesaj klinik randevu talebi taşıyor ve tarihi okunuyor →
						formu ön dolu aç. Düğme tek başına hiçbir kayıt yazmaz.
					-->
					{#if item.appointment_hint}
						<button
							type="button"
							class="mt-1 block text-xs font-medium text-brand hover:underline"
							onclick={() => openAppointment(item)}
						>
							{t('finance.ai.pending.newAppointment')}
						</button>
						{#if item.contacts.length === 0}
							<p class="mt-1 text-xs text-text-muted">
								{t('finance.ai.pending.newAppointmentNoContact')}
							</p>
						{/if}
					{/if}
					{#if item.group_id}
						<p class="mt-1 text-xs text-warning">
							{t('finance.ai.pending.sameEventHint')}
						</p>
					{/if}
					{#if item.has_media && item.media_path}
						<p class="mt-1 flex items-center gap-1 text-xs text-info">
							<Paperclip class="size-3" />
							{t('finance.ai.pending.mediaDemo')}
						</p>
					{/if}
				</div>
				<div class="flex shrink-0 gap-2">
					<Button size="sm" type="button" disabled={parsing} onclick={() => analyzeInboxItem(item)}>
						{t('finance.ai.analyze')}
					</Button>
					<Button size="sm" variant="outline" type="button" onclick={() => ignoreInbox(item.id)}>
						{t('finance.ai.pending.ignore')}
					</Button>
				</div>
			</li>
		{/snippet}

		{#if inboxQuery.isPending}
			<p class="text-sm text-text-muted">{t('finance.ai.pending.loading')}</p>
		{:else if pendingMessages.length === 0}
			<p class="text-sm text-text-muted">{t('finance.ai.pending.empty')}</p>
		{:else}
			{#if groupMode === 'contact'}
				<div class="divide-y divide-border">
					{#each contactGroups as g (g.key)}
						{@const open = expandedGroups.has(g.key)}
						<div class="py-2">
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="flex min-w-0 flex-1 items-center gap-2 text-left"
									aria-expanded={open}
									onclick={() => toggleGroup(g.key)}
								>
									<ChevronRight
										class="size-4 shrink-0 text-text-faint transition-transform {open
											? 'rotate-90'
											: ''}"
									/>
									<span class="truncate text-sm font-semibold text-text">{g.name}</span>
									<span class="shrink-0 text-xs text-text-muted">
										{t('finance.ai.group.counts', { messages: g.items.length, finance: g.finance })}
									</span>
									<time class="ml-auto shrink-0 text-xs text-text-faint" datetime={g.newest}>
										{formatDateTime(g.newest)}
									</time>
								</button>
								{#if g.contactId}
									<a
										href={resolve('/contacts/[id]', { id: g.contactId })}
										class="shrink-0 text-xs text-brand hover:underline"
									>
										{t('finance.ai.group.openContact')}
									</a>
								{/if}
							</div>
							{#if open}
								<ul class="mt-2 divide-y divide-border border-l border-border pl-3 sm:pl-6">
									{#each g.items as item (item.id)}
										{@render mesajKarti(item)}
									{/each}
								</ul>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<ul class="divide-y divide-border">
					{#each pendingMessages as item (item.id)}
						{@render mesajKarti(item)}
					{/each}
				</ul>
			{/if}
		{/if}
	</section>

	{#if drafts.length > 0}
		<section class="mt-4 space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">
					{t('finance.ai.drafts.heading')}
					<span class="font-normal text-text-muted">({drafts.length})</span>
				</h2>
				{#if activeInboxId}
					<Button size="sm" type="button" disabled={!canApprove} onclick={approveAll}>
						{approving ? t('finance.ai.drafts.approving') : t('finance.ai.drafts.approve')}
					</Button>
				{/if}
			</div>

			{#if !activeInboxId}
				<p class="text-sm text-warning">{t('finance.ai.drafts.needInbox')}</p>
			{/if}

			{#if parseError && activeInboxId}
				<p class="text-sm text-danger">{parseError}</p>
			{/if}

			{#each drafts as draft, i (i)}
				<div class="space-y-1">
					<TransactionDraftCard
						{draft}
						{contacts}
						{categories}
						{contactTypes}
						{baseCurrency}
						creating={creatingInline}
						onchange={(patch) => updateDraft(i, patch)}
						onCreateContact={(input) => createContactInline(i, input)}
						onCreateCategory={(input) => createCategoryInline(i, input)}
						onEvidence={(entry) => (evidenceHighlight = entry)}
					/>
					<!-- Model bir mesajdan fazla satır çıkarabiliyor ("50.000'i avanstan ödendi"
					     ayrı gider değil, kaynak). Satırı düzeltmek yerine çıkarmak gerek; onay
					     yalnız kalan satırları yazar. -->
					{#if drafts.length > 1 && draft._status !== 'saved'}
						<button
							type="button"
							class="cursor-pointer text-xs text-text-muted underline-offset-2 hover:underline"
							disabled={approving}
							onclick={() => (drafts = drafts.filter((_, j) => j !== i))}
						>
							{t('finance.ai.drafts.removeLine')}
						</button>
					{/if}
				</div>
			{/each}

			<p class="text-xs text-text-faint">{t('finance.ai.drafts.footnote')}</p>
		</section>
	{/if}
</div>

<!--
	KUCUK-01 — mesajdan randevu. Mevcut randevu formunun aynısı; farkı ön dolum:
	kişi mesajın bağlı kişisi, tarih/saat `appointment_hint`, not mesaj metni.
	Randevu türünü kullanıcı seçer, kayıt yalnız kaydedince oluşur.
-->
<AppointmentFormDialog
	bind:open={appointmentOpen}
	{contacts}
	defaultContactId={appointmentFor?.appointment_hint?.contact_id ??
		appointmentFor?.contacts[0]?.id ??
		null}
	defaultStartsAt={appointmentFor?.appointment_hint?.starts_at ?? null}
	defaultNotes={appointmentFor?.appointment_hint?.note ?? null}
	defaultClinicName={appointmentFor?.appointment_hint?.clinic ?? null}
	saving={appointmentSaving}
	error={appointmentError}
	onsubmit={saveAppointment}
/>

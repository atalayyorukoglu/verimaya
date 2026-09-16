<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type {
		Contact,
		ContactType,
		ContactVisit,
		ContactVisitList,
		FinanceCategory,
		FxRateResponse,
		InvoiceStatus,
		TransactionDraft,
		TransactionEvidenceEntry,
		TransactionStatus
	} from '@verimaya/shared';
	import {
		apiPaths,
		contactVisitDateRangeLabel,
		contactVisitTypeLabels,
		invoiceStatusLabels,
		matchVisitByDate,
		SUPPORTED_CURRENCIES,
		TRANSACTION_PAYMENT_METHODS,
		transactionKindLabels,
		transactionStatusLabels
	} from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass, textareaClass } from '$lib/api';
	import Combobox from '$lib/components/Combobox.svelte';
	import { contactToOption, contactTypeIdByName, searchContactOptions } from '$lib/contacts/search';
	import { createContactLabelCache } from '$lib/contacts/label-cache.svelte';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatMoney } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import EvidenceBadge from '$lib/components/EvidenceBadge.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';

	/**
	 * Kart, Finans "Yeni işlem" formuyla (TransactionFormDialog) alan alan aynıdır.
	 * Taslakta olmayan ama formda olan alanlar (hasta / sorumlu / fatura durumu)
	 * burada tutulur ve onay isteğiyle birlikte gider.
	 */
	export type DraftApprovalState = TransactionDraft & {
		status: TransactionStatus | null;
		paid_amount: number | null;
		fx_rate: number | null;
		amount_base: number | null;
		contact_id: string | null;
		case_contact_id: string | null;
		responsible_contact_id: string | null;
		/** PARA-01 — onayda yazılacak vizit; boş = sunucu tarihten eşleştirsin. */
		contact_visit_id: string | null;
		invoice_status: InvoiceStatus;
		_status: 'idle' | 'saving' | 'saved' | 'error';
		_error: string | null;
	};

	const NEW = '__new__';

	let {
		draft,
		contacts = [],
		categories = [],
		contactTypes = [],
		baseCurrency = 'TRY',
		creating = false,
		onchange,
		onCreateContact,
		onCreateCategory,
		onEvidence
	}: {
		draft: DraftApprovalState;
		contacts?: Contact[];
		categories?: FinanceCategory[];
		contactTypes?: ContactType[];
		baseCurrency?: string;
		creating?: boolean;
		onchange: (patch: Partial<DraftApprovalState>) => void;
		onCreateContact: (input: {
			first_name: string;
			last_name?: string | null;
			contact_type_id: string;
			phone?: string | null;
			email?: string | null;
		}) => Promise<void>;
		onCreateCategory: (input: { name: string; kind: TransactionDraft['kind'] }) => Promise<void>;
		/** AI-09 — kaynak rozetine tıklanınca üstteki mesaj metninde alıntıyı vurgular. */
		onEvidence?: (entry: TransactionEvidenceEntry) => void;
	} = $props();

	const kinds = Object.keys(transactionKindLabels) as TransactionDraft['kind'][];
	const statuses = Object.keys(transactionStatusLabels) as TransactionStatus[];
	const invoiceStatuses = Object.keys(invoiceStatusLabels) as InvoiceStatus[];
	const currencies = SUPPORTED_CURRENCIES;
	const qs = useQueryScope();

	/** Finans "Yeni işlem" formundaki ödeme yöntemi listesiyle aynı; model başka bir
	 *  değer yazdıysa (ör. "Havale") listeye eklenir ki seçim kaybolmasın. */
	const paymentMethodMessageKeys = {
		Nakit: 'finance.form.paymentMethod.cash',
		'Kredi Kartı': 'finance.form.paymentMethod.creditCard',
		'Banka Havalesi/EFT': 'finance.form.paymentMethod.bankTransfer',
		Çek: 'finance.form.paymentMethod.cheque',
		Senet: 'finance.form.paymentMethod.promissoryNote',
		Diğer: 'finance.form.paymentMethod.other'
	} as const satisfies Record<(typeof TRANSACTION_PAYMENT_METHODS)[number], MessageKey>;
	const paymentMethodOptions = $derived.by(() => {
		const options: string[] = [...TRANSACTION_PAYMENT_METHODS];
		if (draft.payment_method && !options.includes(draft.payment_method)) {
			options.push(draft.payment_method);
		}
		return options;
	});
	function paymentMethodLabel(value: string): string {
		if (value in paymentMethodMessageKeys) {
			return t(paymentMethodMessageKeys[value as keyof typeof paymentMethodMessageKeys]);
		}
		return value;
	}

	const amountMajor = $derived(String(draft.amount / 100));
	const paidMajor = $derived(draft.paid_amount == null ? '' : String(draft.paid_amount / 100));
	const amountBaseMajor = $derived(
		draft.amount_base == null ? '' : String(draft.amount_base / 100)
	);
	const saved = $derived(draft._status === 'saved');
	const sameCurrency = $derived(draft.currency === baseCurrency);
	const needsFx = $derived(!sameCurrency);

	/**
	 * Finans formuyla aynı: para birimi bazdan farklıysa ECB kuru otomatik çekilir ve
	 * baz tutar hesaplanır. Kullanıcı kuru/baz tutarı elle yazdıysa (fx_rate dolu) üstüne
	 * yazılmaz; para birimi değişince fx_rate sıfırlanır ve kur yeniden gelir.
	 */
	const fxQuery = createQuery(() => ({
		queryKey: qs.keys.fx.rate({ from: draft.currency, to: baseCurrency, on: draft.occurred_on }),
		queryFn: () =>
			apiGet<FxRateResponse>(
				apiPaths.fxRate({ from: draft.currency, to: baseCurrency, on: draft.occurred_on })
			),
		enabled: qs.ready && needsFx && !!draft.occurred_on && !saved,
		retry: 1,
		staleTime: 60_000
	}));
	const fxFetching = $derived(needsFx && draft.fx_rate == null && fxQuery.isFetching);
	const fxError = $derived(needsFx && draft.fx_rate == null && fxQuery.isError);
	let fxDated = $state<string | null>(null);

	$effect(() => {
		if (!needsFx || saved || draft.fx_rate != null || !fxQuery.isSuccess) return;
		const info = fxQuery.data;
		if (draft.amount_base != null && draft.amount > 0) {
			// Model karşı tutarı mesajdan okuduysa ("= 1.200 GBP") o esas; kur ondan türetilir.
			onchange({ fx_rate: Math.round((draft.amount_base / draft.amount) * 10000) / 10000 });
			fxDated = null;
			return;
		}
		fxDated = info.date;
		onchange({
			fx_rate: info.rate,
			amount_base: Math.round((draft.amount / 100) * info.rate * 100)
		});
	});
	const instanceId = crypto.randomUUID();
	const fieldId = (name: string) => `draft-${instanceId}-${name}`;

	const categoryOptions = $derived(
		categories
			.filter((c) => c.kind === draft.kind)
			.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
	);

	/*
	 * Kişi kutuları sunucu taraflı arar. `contacts` yalnız ilk sayfadır (100 kayıt);
	 * 1000+ kişili kiracıda aranan hasta / firma orada olmadığı için kutular boş
	 * görünüyordu. İlk sayfa hâlâ "hiçbir şey yazmadan açınca" gösterilecek liste.
	 *
	 * Kural Finans formuyla aynı: hasta listesi "Hasta" tipiyle sınırlı, sorumlu
	 * listesi kısıtsız (Tracker'da personel dışı kişiler de sorumlu olabiliyor).
	 */
	const HASTA_TURU = 'Hasta';
	const hastaTypeId = $derived(contactTypeIdByName(contactTypes, HASTA_TURU));
	const contactOptions = $derived(contacts.map(contactToOption));
	const caseContactOptions = $derived(
		contacts.filter((c) => c.contact_type_name === HASTA_TURU).map(contactToOption)
	);
	const responsibleContactOptions = $derived(contacts.map(contactToOption));

	const searchAllContacts = (q: string) => searchContactOptions(q);
	const searchPatients = (q: string) =>
		searchContactOptions(q, { typeId: hastaTypeId, typeName: HASTA_TURU });

	/*
	 * PARA-01 — vizit kutusu. Vizitler hastaya ait: önce `case_contact_id`, o boşsa
	 * karşı taraf. Hasta yoksa kutu hiç görünmez.
	 */
	const visitOwnerId = $derived(draft.case_contact_id ?? draft.contact_id ?? '');

	const visitsQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.visits(visitOwnerId),
		queryFn: () => apiGet<ContactVisitList>(apiPaths.contactVisits(visitOwnerId)),
		enabled: qs.ready && visitOwnerId.length > 0
	}));

	const visitOptions = $derived<ContactVisit[]>(visitsQuery.data?.items ?? []);

	function visitLabel(visit: ContactVisit): string {
		const range = contactVisitDateRangeLabel(visit);
		const type = contactVisitTypeLabels[visit.visit_type] ?? visit.visit_type;
		return range ? `${type} · ${range}` : type;
	}

	/*
	 * İşlem günü tek bir vizitin (geliş − 2 … dönüş + 2) aralığına düşüyorsa kutu
	 * kendiliğinden dolar. Kaydedilmiş kartta (`saved`) dokunulmaz.
	 */
	$effect(() => {
		if (saved || draft.contact_visit_id) return;
		const day = draft.occurred_on;
		const list = visitOptions;
		if (!day || list.length === 0) return;
		const match = matchVisitByDate(day, list);
		if (match) onchange({ contact_visit_id: match.id });
	});

	/*
	 * Seçili kişinin etiketi: sunucu araması listeyi değiştirdiğinde seçili kayıt
	 * listede kalmayabilir, ayrıca sunucu ön dolumu ilk sayfada olmayan bir kişiyi
	 * işaretlemiş olabilir. Bilinmeyen kimlikler tek tek çözülür.
	 */
	const labels = createContactLabelCache(() => contacts);
	const contactLabelFor = (id: string | null | undefined) => labels.labelFor(id);

	$effect(() => {
		labels.ensure([draft.case_contact_id, draft.responsible_contact_id, draft.contact_id]);
	});

	let showNewContact = $state(false);
	let showNewCategory = $state(false);
	let newContactName = $state('');
	let newContactTypeId = $state('');
	let newContactPhone = $state('');
	let newContactEmail = $state('');
	let newCategoryName = $state('');
	let createError = $state<string | null>(null);

	function splitDisplayName(name: string): { first_name: string; last_name: string | null } {
		const trimmed = name.trim();
		const spaceIdx = trimmed.indexOf(' ');
		if (spaceIdx === -1) return { first_name: trimmed, last_name: null };
		return {
			first_name: trimmed.slice(0, spaceIdx),
			last_name: trimmed.slice(spaceIdx + 1).trim() || null
		};
	}

	function onAmountInput(value: string) {
		const n = Number.parseFloat(value.replace(',', '.'));
		if (!Number.isFinite(n) || n <= 0) return;
		const amount = Math.round(n * 100);
		const patch: Partial<DraftApprovalState> = { amount };
		if (draft.status === 'paid') patch.paid_amount = amount;
		if (sameCurrency) patch.amount_base = amount;
		else if (draft.fx_rate != null) {
			patch.amount_base = Math.round((amount / 100) * draft.fx_rate * 100);
		}
		onchange(patch);
	}

	function onPaidInput(value: string) {
		const n = Number.parseFloat(value.replace(',', '.'));
		if (!Number.isFinite(n) || n < 0) return;
		onchange({ paid_amount: Math.round(n * 100) });
	}

	function onFxInput(value: string) {
		const n = Number.parseFloat(value.replace(',', '.'));
		if (!Number.isFinite(n) || n <= 0) return;
		const patch: Partial<DraftApprovalState> = { fx_rate: n };
		if (!sameCurrency) {
			patch.amount_base = Math.round((draft.amount / 100) * n * 100);
		}
		onchange(patch);
	}

	function onAmountBaseInput(value: string) {
		const n = Number.parseFloat(value.replace(',', '.'));
		if (!Number.isFinite(n) || n < 0) return;
		onchange({ amount_base: Math.round(n * 100) });
	}

	/**
	 * Tür değişince kategori listesi de değişir. Eski kategori yeni türde yoksa
	 * temizlenir; yoksa kutuda "listede olmayan" bir değer seçili görünüyor ve
	 * onaydan sonra gelir satırına gider kategorisi yazılıyordu.
	 */
	function onKindChange(kind: TransactionDraft['kind']) {
		const patch: Partial<DraftApprovalState> = { kind };
		const yeniListe = categories.filter((c) => c.kind === kind);
		const kalan = yeniListe.find((c) => c.name === draft.category) ?? null;
		if (!kalan) {
			patch.category = null;
			patch.subcategory = null;
		} else if (draft.subcategory && !kalan.subcategories.includes(draft.subcategory)) {
			patch.subcategory = null;
		}
		onchange(patch);
	}

	function onStatusChange(status: TransactionStatus) {
		const patch: Partial<DraftApprovalState> = { status };
		if (status === 'paid') patch.paid_amount = draft.amount;
		if (status === 'unpaid') patch.paid_amount = 0;
		onchange(patch);
	}

	function onCurrencyChange(currency: (typeof currencies)[number]) {
		const patch: Partial<DraftApprovalState> = { currency };
		fxDated = null;
		if (currency === baseCurrency) {
			patch.fx_rate = 1;
			patch.amount_base = draft.amount;
		} else {
			patch.fx_rate = null;
			patch.amount_base = null;
		}
		onchange(patch);
	}

	function onDateChange(occurred_on: string) {
		const patch: Partial<DraftApprovalState> = { occurred_on };
		// Tarih değişince kur da o güne göre yeniden gelsin (elle girilmediyse zaten yeniden hesaplanır).
		if (needsFx && fxDated != null) {
			patch.fx_rate = null;
			patch.amount_base = null;
			fxDated = null;
		}
		onchange(patch);
	}

	const subcategoryOptions = $derived(
		categoryOptions.find((c) => c.name === draft.category)?.subcategories ?? []
	);

	function resetCreateForms() {
		showNewContact = false;
		showNewCategory = false;
		newContactName = '';
		newContactTypeId = '';
		newContactPhone = '';
		newContactEmail = '';
		newCategoryName = '';
		createError = null;
	}

	async function submitNewContact() {
		if (!newContactName.trim() || !newContactTypeId || creating) return;
		createError = null;
		try {
			const { first_name, last_name } = splitDisplayName(newContactName);
			await onCreateContact({
				first_name,
				last_name,
				contact_type_id: newContactTypeId,
				phone: newContactPhone.trim() || null,
				email: newContactEmail.trim() || null
			});
			resetCreateForms();
		} catch (err) {
			createError = err instanceof Error ? err.message : t('finance.ai.create.failed');
		}
	}

	async function submitNewCategory() {
		if (!newCategoryName.trim() || creating) return;
		createError = null;
		try {
			await onCreateCategory({ name: newCategoryName.trim(), kind: draft.kind });
			resetCreateForms();
		} catch (err) {
			createError = err instanceof Error ? err.message : t('finance.ai.create.failed');
		}
	}
</script>

<div
	class="overflow-hidden rounded-lg border border-border p-4 sm:p-5 {saved
		? 'border-success/40 bg-success/5'
		: 'bg-surface'}"
>
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<StatusBadge
				label={transactionKindLabels[draft.kind]}
				tone={draft.kind === 'income' ? 'success' : 'danger'}
			/>
			<span class="text-sm font-semibold text-text tabular-nums">
				{formatMoney(draft.amount, draft.currency)}
			</span>
		</div>
		{#if saved}
			<span class="text-xs font-medium text-success">{t('finance.ai.draft.saved')}</span>
		{/if}
	</div>

	<!--
		Alan sırası ve etiketleri Finans › "Yeni işlem" formuyla (TransactionFormDialog)
		birebir aynı: Tür / Durum, Para birimi / Tutar / Tarih, kur kutusu, Kısmi'de
		ödenen, Kategori / Alt kategori, Kişi / Etiket, Hasta / Sorumlu, Fatura,
		Ödeme yöntemi, Açıklama. Formda olmayan hiçbir alan (ör. Başlık) burada yok.
	-->
	<div class="min-w-0 space-y-3">
		<div class="grid min-w-0 gap-3 sm:grid-cols-2">
			<div class="min-w-0">
				<div class="flex items-center justify-between gap-2">
					<label class={labelClass} for={fieldId('kind')}>{t('finance.form.kind')}</label>
					<EvidenceBadge entry={draft.evidence?.kind} onselect={onEvidence} />
				</div>
				<select
					id={fieldId('kind')}
					class={fieldClass}
					disabled={saved}
					value={draft.kind}
					onchange={(e) => onKindChange(e.currentTarget.value as TransactionDraft['kind'])}
				>
					{#each kinds as k (k)}
						<option value={k}>{transactionKindLabels[k]}</option>
					{/each}
				</select>
			</div>

			<div class="min-w-0">
				<label class={labelClass} for={fieldId('status')}>{t('finance.form.status')}</label>
				<select
					id={fieldId('status')}
					class={fieldClass}
					disabled={saved}
					value={draft.status ?? ''}
					onchange={(e) => {
						const v = e.currentTarget.value;
						if (v) onStatusChange(v as TransactionStatus);
						else onchange({ status: null, paid_amount: null });
					}}
				>
					<!-- Formdan tek fark: durum seçilmeden onay verilemez, o yüzden boş seçenek kalır. -->
					<option value="">{t('finance.ai.draft.statusNone')}</option>
					{#each statuses as s (s)}
						<option value={s}>{transactionStatusLabels[s]}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="grid min-w-0 gap-3 sm:grid-cols-3">
			<div class="min-w-0">
				<div class="flex items-center justify-between gap-2">
					<label class={labelClass} for={fieldId('currency')}>{t('finance.form.currency')}</label>
					<EvidenceBadge entry={draft.evidence?.currency} onselect={onEvidence} />
				</div>
				<select
					id={fieldId('currency')}
					class={fieldClass}
					disabled={saved}
					value={draft.currency}
					onchange={(e) => onCurrencyChange(e.currentTarget.value as (typeof currencies)[number])}
				>
					{#each currencies as c (c)}
						<option value={c}>{c}</option>
					{/each}
				</select>
			</div>

			<div class="min-w-0">
				<div class="flex items-center justify-between gap-2">
					<label class={labelClass} for={fieldId('amount')}
						>{t('finance.form.amount', { currency: draft.currency })}</label
					>
					<EvidenceBadge entry={draft.evidence?.amount} onselect={onEvidence} />
				</div>
				<input
					id={fieldId('amount')}
					class={fieldClass}
					type="number"
					min="0"
					step="0.01"
					disabled={saved}
					value={amountMajor}
					oninput={(e) => onAmountInput(e.currentTarget.value)}
				/>
			</div>

			<div class="min-w-0">
				<div class="flex items-center justify-between gap-2">
					<label class={labelClass} for={fieldId('date')}>{t('finance.form.date')}</label>
					<EvidenceBadge entry={draft.evidence?.occurred_on} onselect={onEvidence} />
				</div>
				<input
					id={fieldId('date')}
					class={fieldClass}
					type="date"
					disabled={saved}
					value={draft.occurred_on}
					onchange={(e) => onDateChange(e.currentTarget.value)}
				/>
			</div>
		</div>

		{#if needsFx}
			<div
				class="grid min-w-0 gap-3 rounded-[6px] border border-warning/40 bg-warning/10 p-3 sm:grid-cols-2"
			>
				<div class="min-w-0">
					<label class={labelClass} for={fieldId('base')}
						>{t('finance.form.baseAmount', { currency: baseCurrency })}</label
					>
					<input
						id={fieldId('base')}
						class={fieldClass}
						type="number"
						min="0"
						step="0.01"
						disabled={saved}
						value={amountBaseMajor}
						aria-busy={fxFetching}
						oninput={(e) => onAmountBaseInput(e.currentTarget.value)}
					/>
					{#if fxFetching}
						<p class="mt-1 min-w-0 text-[11px] break-words text-text-faint">
							{t('finance.form.fxLoading')}
						</p>
					{:else if fxError}
						<p class="mt-1 min-w-0 text-[11px] break-words text-warning">
							{t('finance.form.fxError')}
						</p>
					{:else if fxDated}
						<p class="mt-1 min-w-0 text-[11px] break-words text-text-faint">
							{t('finance.form.fxDated', { date: fxDated })}
						</p>
					{:else}
						<p class="mt-1 min-w-0 text-[11px] break-words text-text-faint">
							{t('finance.form.fxLocked')}
						</p>
					{/if}
				</div>
				<div class="min-w-0">
					<label class={labelClass} for={fieldId('fx')}
						>{t('finance.form.fxRate', { currency: draft.currency, base: baseCurrency })}</label
					>
					<input
						id={fieldId('fx')}
						class={fieldClass}
						type="number"
						min="0"
						step="0.0001"
						disabled={saved}
						value={draft.fx_rate ?? ''}
						oninput={(e) => onFxInput(e.currentTarget.value)}
					/>
				</div>
			</div>
		{/if}

		{#if draft.status === 'partial'}
			<div class="min-w-0">
				<label class={labelClass} for={fieldId('paid')}
					>{t('finance.form.paidAmount', { currency: draft.currency })}</label
				>
				<input
					id={fieldId('paid')}
					class={fieldClass}
					type="number"
					min="0"
					step="0.01"
					disabled={saved}
					value={paidMajor}
					oninput={(e) => onPaidInput(e.currentTarget.value)}
				/>
			</div>
		{/if}

		<div class="grid min-w-0 gap-3 sm:grid-cols-2">
			<div class="min-w-0">
				<div class="flex items-center justify-between gap-2">
					<label class={labelClass} for={fieldId('category')}>{t('finance.form.category')}</label>
					<EvidenceBadge entry={draft.evidence?.category} onselect={onEvidence} />
				</div>
				<select
					id={fieldId('category')}
					class={fieldClass}
					disabled={saved || creating}
					value={showNewCategory ? NEW : (draft.category ?? '')}
					onchange={(e) => {
						const v = e.currentTarget.value;
						if (v === NEW) {
							showNewCategory = true;
							createError = null;
							return;
						}
						showNewCategory = false;
						onchange({ category: v || null });
					}}
				>
					<option value="">{t('finance.form.none')}</option>
					{#each categoryOptions as c (c.id)}
						<option value={c.name}>{c.name}</option>
					{/each}
					{#if draft.category && !categoryOptions.some((c) => c.name === draft.category)}
						<option value={draft.category}>{draft.category}</option>
					{/if}
					<option value={NEW}>{t('finance.ai.draft.categoryNew')}</option>
				</select>
				{#if showNewCategory}
					<div class="mt-2 space-y-2 rounded-[6px] border border-border bg-surface-2 p-3">
						<label class={labelClass} for={fieldId('new-cat-name')}
							>{t('finance.ai.create.categoryName')}</label
						>
						<input
							id={fieldId('new-cat-name')}
							class={fieldClass}
							disabled={creating}
							bind:value={newCategoryName}
						/>
						<div class="flex flex-wrap gap-2">
							<Button
								size="sm"
								type="button"
								disabled={creating || !newCategoryName.trim()}
								onclick={() => void submitNewCategory()}
							>
								{creating ? t('finance.ai.create.saving') : t('finance.ai.create.save')}
							</Button>
							<Button
								size="sm"
								variant="outline"
								type="button"
								disabled={creating}
								onclick={resetCreateForms}
							>
								{t('finance.ai.create.cancel')}
							</Button>
						</div>
					</div>
				{/if}
			</div>

			<div class="min-w-0">
				<label class={labelClass} for={fieldId('subcategory')}
					>{t('finance.form.subcategory')}</label
				>
				{#if subcategoryOptions.length > 0}
					<select
						id={fieldId('subcategory')}
						class={fieldClass}
						disabled={saved}
						value={draft.subcategory ?? ''}
						onchange={(e) => onchange({ subcategory: e.currentTarget.value || null })}
					>
						<option value="">{t('finance.form.none')}</option>
						{#each subcategoryOptions as s (s)}
							<option value={s}>{s}</option>
						{/each}
						{#if draft.subcategory && !subcategoryOptions.includes(draft.subcategory)}
							<option value={draft.subcategory}>{draft.subcategory}</option>
						{/if}
					</select>
				{:else}
					<input
						id={fieldId('subcategory')}
						class={fieldClass}
						disabled={saved}
						maxlength={128}
						value={draft.subcategory ?? ''}
						oninput={(e) => onchange({ subcategory: e.currentTarget.value || null })}
					/>
				{/if}
			</div>
		</div>

		<div class="grid min-w-0 gap-3 sm:grid-cols-2">
			<div class="min-w-0">
				<div class="flex items-center justify-between gap-2">
					<label class={labelClass} for={fieldId('contact')}>{t('finance.form.contact')}</label>
					<EvidenceBadge entry={draft.evidence?.contact_id} onselect={onEvidence} />
				</div>
				<!--
					Düz select değil Combobox: kiracıda 1000+ kişi var, select'te ne arama
					vardı ne de ilk 100'ün dışındaki kayıt ("Dumos Hotel" hiç görünmüyordu).
					"Yeni kişi" artık listenin içinde bir seçenek değil, altındaki düğme —
					aramayla karışmasın.
				-->
				<Combobox
					id={fieldId('contact')}
					value={draft.contact_id ?? ''}
					options={contactOptions}
					onsearch={searchAllContacts}
					selectedLabel={draft.contact_display_name ?? contactLabelFor(draft.contact_id)}
					disabled={saved || creating}
					placeholder={t('finance.form.contactSearchPlaceholder')}
					emptyText={t('finance.form.contactEmpty')}
					searchingText={t('common.searching')}
					clearLabel={t('finance.ai.draft.contactNone')}
					onselect={(option) =>
						onchange({
							contact_id: option?.value ?? null,
							contact_display_name: option?.label ?? null
						})}
				/>
				{#if !saved && !showNewContact}
					<button
						type="button"
						class="mt-1 cursor-pointer text-xs font-medium text-brand underline-offset-2 hover:underline"
						disabled={creating}
						onclick={() => {
							showNewContact = true;
							createError = null;
						}}
					>
						{t('finance.ai.draft.contactNew')}
					</button>
				{/if}
				{#if showNewContact}
					<div class="mt-2 space-y-2 rounded-[6px] border border-border bg-surface-2 p-3">
						<label class={labelClass} for={fieldId('new-contact-name')}
							>{t('finance.ai.create.fullName')}</label
						>
						<input
							id={fieldId('new-contact-name')}
							class={fieldClass}
							disabled={creating}
							bind:value={newContactName}
						/>
						<label class={labelClass} for={fieldId('new-contact-type')}
							>{t('finance.ai.create.contactType')}</label
						>
						<select
							id={fieldId('new-contact-type')}
							class={fieldClass}
							disabled={creating}
							bind:value={newContactTypeId}
						>
							<option value="">{t('finance.ai.create.contactTypeNone')}</option>
							{#each contactTypes as ct (ct.id)}
								<option value={ct.id}>{ct.name}</option>
							{/each}
						</select>
						<label class={labelClass} for={fieldId('new-contact-phone')}
							>{t('finance.ai.create.phone')}</label
						>
						<input
							id={fieldId('new-contact-phone')}
							class={fieldClass}
							disabled={creating}
							bind:value={newContactPhone}
						/>
						<label class={labelClass} for={fieldId('new-contact-email')}
							>{t('finance.ai.create.email')}</label
						>
						<input
							id={fieldId('new-contact-email')}
							class={fieldClass}
							type="email"
							disabled={creating}
							bind:value={newContactEmail}
						/>
						<div class="flex flex-wrap gap-2">
							<Button
								size="sm"
								type="button"
								disabled={creating || !newContactName.trim() || !newContactTypeId}
								onclick={() => void submitNewContact()}
							>
								{creating ? t('finance.ai.create.saving') : t('finance.ai.create.save')}
							</Button>
							<Button
								size="sm"
								variant="outline"
								type="button"
								disabled={creating}
								onclick={resetCreateForms}
							>
								{t('finance.ai.create.cancel')}
							</Button>
						</div>
					</div>
				{/if}
			</div>

			<div class="min-w-0">
				<div class="flex items-center justify-between gap-2">
					<label class={labelClass} for={fieldId('contact-label')}
						>{t('finance.form.contactFallback')}</label
					>
					<EvidenceBadge entry={draft.evidence?.contact_label} onselect={onEvidence} />
				</div>
				<input
					id={fieldId('contact-label')}
					class={fieldClass}
					maxlength={255}
					placeholder={t('finance.form.contactFreePlaceholder')}
					disabled={saved || !!draft.contact_id}
					value={draft.contact_label ?? ''}
					oninput={(e) => onchange({ contact_label: e.currentTarget.value || null })}
				/>
			</div>
		</div>

		<div class="grid min-w-0 gap-3 sm:grid-cols-2">
			<div class="min-w-0">
				<label class={labelClass} for={fieldId('case')}>{t('finance.form.case')}</label>
				<Combobox
					id={fieldId('case')}
					value={draft.case_contact_id ?? ''}
					options={caseContactOptions}
					onsearch={searchPatients}
					selectedLabel={contactLabelFor(draft.case_contact_id)}
					disabled={saved}
					placeholder={t('finance.form.caseSearchPlaceholder')}
					emptyText={t('finance.form.caseEmpty')}
					searchingText={t('common.searching')}
					clearLabel={t('finance.form.caseClear')}
					onselect={(option) => onchange({ case_contact_id: option?.value ?? null })}
				/>
			</div>
			<div class="min-w-0">
				<label class={labelClass} for={fieldId('responsible')}
					>{t('finance.form.responsible')}</label
				>
				<Combobox
					id={fieldId('responsible')}
					value={draft.responsible_contact_id ?? ''}
					options={responsibleContactOptions}
					onsearch={searchAllContacts}
					selectedLabel={contactLabelFor(draft.responsible_contact_id)}
					disabled={saved}
					placeholder={t('finance.form.responsibleSearchPlaceholder')}
					emptyText={t('finance.form.responsibleEmpty')}
					searchingText={t('common.searching')}
					clearLabel={t('finance.form.responsibleClear')}
					onselect={(option) => onchange({ responsible_contact_id: option?.value ?? null })}
				/>
			</div>
		</div>

		{#if visitOwnerId && visitOptions.length > 0}
			<div class="min-w-0">
				<label class={labelClass} for={fieldId('visit')}>{t('finance.form.visit')}</label>
				<select
					id={fieldId('visit')}
					class={fieldClass}
					disabled={saved}
					value={draft.contact_visit_id ?? ''}
					onchange={(e) => onchange({ contact_visit_id: e.currentTarget.value || null })}
				>
					<option value="">{t('finance.form.visitNone')}</option>
					{#each visitOptions as visit (visit.id)}
						<option value={visit.id}>{visitLabel(visit)}</option>
					{/each}
				</select>
				<p class="mt-1 text-xs text-text-faint">{t('finance.form.visitHint')}</p>
			</div>
		{/if}

		<div class="min-w-0">
			<label class={labelClass} for={fieldId('invoice')}>{t('finance.form.invoice')}</label>
			<select
				id={fieldId('invoice')}
				class={fieldClass}
				disabled={saved}
				value={draft.invoice_status}
				onchange={(e) => onchange({ invoice_status: e.currentTarget.value as InvoiceStatus })}
			>
				{#each invoiceStatuses as s (s)}
					<option value={s}>{invoiceStatusLabels[s]}</option>
				{/each}
			</select>
		</div>

		<div class="min-w-0">
			<div class="flex items-center justify-between gap-2">
				<label class={labelClass} for={fieldId('method')}>{t('finance.form.paymentMethod')}</label>
				<EvidenceBadge entry={draft.evidence?.payment_method} onselect={onEvidence} />
			</div>
			<select
				id={fieldId('method')}
				class={fieldClass}
				disabled={saved}
				value={draft.payment_method ?? ''}
				onchange={(e) => onchange({ payment_method: e.currentTarget.value || null })}
			>
				<option value="">{t('finance.form.paymentMethodNone')}</option>
				{#each paymentMethodOptions as method (method)}
					<option value={method}>{paymentMethodLabel(method)}</option>
				{/each}
			</select>
		</div>

		<div class="min-w-0">
			<label class={labelClass} for={fieldId('desc')}>{t('finance.form.descriptionLabel')}</label>
			<textarea
				id={fieldId('desc')}
				class={textareaClass}
				rows={3}
				maxlength={8000}
				disabled={saved}
				value={draft.description ?? ''}
				oninput={(e) => onchange({ description: e.currentTarget.value || null })}></textarea>
		</div>
	</div>

	{#if createError}
		<p class="mt-3 text-sm text-danger">{createError}</p>
	{/if}
	{#if draft._status === 'error' && draft._error}
		<p class="mt-3 text-sm text-danger">{draft._error}</p>
	{/if}
</div>

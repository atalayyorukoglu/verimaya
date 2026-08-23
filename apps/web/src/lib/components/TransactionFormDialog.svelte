<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type {
		Contact,
		FinanceCategory,
		FxRateResponse,
		InvoiceStatus,
		SupportedCurrency,
		Tenant,
		Transaction,
		TransactionAuditDraftResponse,
		TransactionAuditIssue,
		TransactionCreate,
		TransactionEvidenceField,
		TransactionKind,
		TransactionStatus,
		TransactionUpdate
	} from '@verimaya/shared';
	import {
		apiPaths,
		deriveTransactionLabel,
		invoiceStatusLabels,
		SUPPORTED_CURRENCIES,
		toTenantDayKey,
		TRANSACTION_PAYMENT_METHODS,
		transactionKindLabels,
		transactionStatusLabels
	} from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass, labelClass, listUrl, textareaClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import Combobox from '$lib/components/Combobox.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import { formatDate, formatMoney } from '$lib/format';
	import { type DeleteConfirmPhase, runConfirmedDelete } from '$lib/components/delete-confirm-flow';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { visibleSourceQuotes } from '$lib/finance/evidence-highlight';

	let {
		open = $bindable(false),
		transaction = null,
		defaultContactId = null,
		saving = false,
		error = null,
		onsubmit,
		ondelete
	}: {
		open?: boolean;
		transaction?: Transaction | null;
		defaultContactId?: string | null;
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: TransactionCreate | TransactionUpdate) => void | Promise<void>;
		ondelete?: () => void | Promise<void>;
	} = $props();

	const kinds = Object.keys(transactionKindLabels) as TransactionKind[];
	const statuses = Object.keys(transactionStatusLabels) as TransactionStatus[];
	const invoiceStatuses = Object.keys(invoiceStatusLabels) as InvoiceStatus[];
	const qs = useQueryScope();

	const paymentMethodMessageKeys = {
		Nakit: 'finance.form.paymentMethod.cash',
		'Kredi Kartı': 'finance.form.paymentMethod.creditCard',
		'Banka Havalesi/EFT': 'finance.form.paymentMethod.bankTransfer',
		Çek: 'finance.form.paymentMethod.cheque',
		Senet: 'finance.form.paymentMethod.promissoryNote',
		Diğer: 'finance.form.paymentMethod.other'
	} as const satisfies Record<(typeof TRANSACTION_PAYMENT_METHODS)[number], MessageKey>;

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>(apiPaths.tenantsCurrent),
		enabled: open && qs.ready
	}));

	const catsQuery = createQuery(() => ({
		queryKey: qs.keys.settings.financeCategories(),
		queryFn: () => apiGet<{ items: FinanceCategory[] }>(apiPaths.settingsFinanceCategories),
		enabled: open && qs.ready
	}));

	const contactsQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.list({ limit: 100, for: 'tx-form' }),
		queryFn: () =>
			apiGet<{ items: Contact[]; next_cursor: string | null }>(listUrl('contacts', { limit: 100 })),
		enabled: open && qs.ready
	}));

	const tenantBase = $derived((tenantQuery.data?.base_currency ?? 'TRY') as SupportedCurrency);
	const tenantTimezone = $derived(tenantQuery.data?.timezone ?? 'Europe/Istanbul');

	let kind = $state<TransactionKind>('income');
	let subtitle = $state('');
	let category = $state('');
	let occurred_on = $state('');
	let status = $state<TransactionStatus>('unpaid');
	let invoice_status = $state<InvoiceStatus>('none');
	let currency = $state<SupportedCurrency>('TRY');
	let amountMajor = $state('');
	/** Manual base / rate overrides when amountBaseTouched (Tracker equivTouched). */
	let amountBaseMajor = $state('');
	let fxRate = $state('');
	let fxDated = $state<string | null>(null);
	let paidMajor = $state('');
	let contact_id = $state('');
	let contact_label = $state('');
	let case_contact_id = $state('');
	let responsible_contact_id = $state('');
	let payment_method = $state('');
	let description = $state('');
	let deletePhase = $state<DeleteConfirmPhase>('form');
	/** User edited base amount or rate — auto FX must not overwrite until they clear base. */
	let amountBaseTouched = $state(false);
	let auditIssues = $state<TransactionAuditIssue[]>([]);

	const categoryOptions = $derived(
		(catsQuery.data?.items ?? [])
			.filter((c) => c.kind === kind)
			.sort((a, b) => a.sort_order - b.sort_order)
	);

	const selectedCategory = $derived(categoryOptions.find((c) => c.name === category) ?? null);
	const subtitleOptions = $derived(selectedCategory?.subcategories ?? []);
	const needsFx = $derived(currency !== tenantBase);
	const contactOptions = $derived(
		(contactsQuery.data?.items ?? []).map((c) => ({
			value: c.id,
			label: c.display_name,
			description: c.contact_type_name
		}))
	);
	const caseContactOptions = $derived(
		(contactsQuery.data?.items ?? [])
			.filter((c) => c.contact_type_name === 'Hasta')
			.map((c) => ({
				value: c.id,
				label: c.display_name,
				description: c.contact_type_name
			}))
	);
	const responsibleContactOptions = $derived(
		(contactsQuery.data?.items ?? [])
			.filter((c) => c.contact_type_name === 'Personel')
			.map((c) => ({
				value: c.id,
				label: c.display_name,
				description: c.contact_type_name
			}))
	);
	const paymentMethodOptions = $derived.by(() => {
		const options: string[] = [...TRANSACTION_PAYMENT_METHODS];
		if (payment_method && !options.includes(payment_method)) options.push(payment_method);
		return options;
	});

	const fxQuery = createQuery(() => ({
		queryKey: qs.keys.fx.rate({ from: currency, to: tenantBase, on: occurred_on }),
		queryFn: () =>
			apiGet<FxRateResponse>(apiPaths.fxRate({ from: currency, to: tenantBase, on: occurred_on })),
		enabled: open && qs.ready && needsFx && !!occurred_on && !!tenantQuery.data,
		retry: 1,
		staleTime: 60_000
	}));

	const fxFetching = $derived(needsFx && (fxQuery.isPending || fxQuery.isFetching));
	const fxError = $derived(needsFx && fxQuery.isError);
	const fxInfo = $derived(needsFx && fxQuery.isSuccess ? fxQuery.data : null);

	const displayFxRate = $derived.by(() => {
		if (amountBaseTouched) return fxRate;
		if (fxInfo) return String(fxInfo.rate);
		return fxRate;
	});
	const displayFxDated = $derived.by(() => {
		if (amountBaseTouched) return fxDated;
		return fxInfo?.date ?? fxDated;
	});
	const displayAmountBase = $derived.by(() => {
		if (amountBaseTouched) return amountBaseMajor;
		if (!fxInfo) return amountBaseMajor;
		const amount = Number.parseFloat(amountMajor.replace(',', '.'));
		if (!Number.isFinite(amount) || amount <= 0) return '';
		return (Math.round(amount * fxInfo.rate * 100) / 100).toFixed(2);
	});

	$effect(() => {
		if (!open) {
			deletePhase = 'form';
			return;
		}
		kind = transaction?.kind ?? 'income';
		subtitle = transaction?.subtitle ?? '';
		category = transaction?.category ?? '';
		occurred_on = transaction?.occurred_on ?? toTenantDayKey(new Date(), tenantTimezone);
		status = transaction?.status ?? 'unpaid';
		invoice_status = transaction?.invoice_status ?? 'none';
		currency = transaction?.currency ?? tenantBase;
		amountMajor = transaction ? String(transaction.amount / 100) : '';
		amountBaseMajor = transaction?.amount_base != null ? String(transaction.amount_base / 100) : '';
		fxRate = transaction?.fx_rate != null ? String(transaction.fx_rate) : '';
		fxDated = transaction?.fx_dated ?? null;
		paidMajor = transaction?.paid_amount != null ? String(transaction.paid_amount / 100) : '';
		contact_id = transaction?.contact_id ?? defaultContactId ?? '';
		contact_label = transaction?.contact_label ?? '';
		case_contact_id = transaction?.case_contact_id ?? '';
		responsible_contact_id = transaction?.responsible_contact_id ?? '';
		payment_method = transaction?.payment_method ?? '';
		description = transaction?.description ?? '';
		deletePhase = 'form';
		// Preserve saved base amount on edit; new rows start auto-fill.
		amountBaseTouched = transaction?.amount_base != null;
		auditIssues = [];
	});

	const isEdit = $derived(!!transaction);
	const confirmingDelete = $derived(deletePhase === 'confirm');

	/** G-04: debounce live audit — never blocks save. */
	$effect(() => {
		if (!open || confirmingDelete || !qs.ready) {
			return;
		}
		const draftKind = kind;
		const draftCategory = category;
		const draftStatus = status;
		const draftCurrency = currency;
		const draftAmountMajor = amountMajor;
		const draftPaidMajor = paidMajor;
		const draftContactId = contact_id;
		const draftContactLabel = contact_label;
		const draftCaseId = case_contact_id;
		const draftResponsibleId = responsible_contact_id;
		const draftAmountBase = displayAmountBase;
		const draftNeedsFx = needsFx;

		const controller = new AbortController();
		const timer = setTimeout(() => {
			const amountParsed = Math.round(Number.parseFloat(draftAmountMajor.replace(',', '.')) * 100);
			const amount = Number.isFinite(amountParsed) && amountParsed > 0 ? amountParsed : null;
			let paid_amount: number | null = null;
			if (draftStatus === 'paid' && amount != null) {
				paid_amount = amount;
			} else if (draftStatus === 'partial') {
				const paid = Math.round(Number.parseFloat(draftPaidMajor.replace(',', '.')) * 100);
				paid_amount = Number.isFinite(paid) ? paid : null;
			} else if (draftStatus === 'unpaid') {
				paid_amount = 0;
			}
			let amount_base: number | null = null;
			if (!draftNeedsFx && amount != null) {
				amount_base = amount;
			} else if (draftNeedsFx && draftAmountBase.trim() !== '') {
				const base = Math.round(Number.parseFloat(draftAmountBase.replace(',', '.')) * 100);
				amount_base = Number.isFinite(base) ? base : null;
			}

			void apiSend<TransactionAuditDraftResponse>(
				apiPaths.transactionsAuditDraft,
				'POST',
				{
					kind: draftKind,
					category: draftCategory.trim() || null,
					contact_id: draftContactId || null,
					contact_label: draftContactLabel.trim() || null,
					case_contact_id: draftCaseId || null,
					responsible_contact_id: draftResponsibleId || null,
					currency: draftCurrency,
					amount,
					paid_amount,
					amount_base,
					status: draftStatus
				},
				{ signal: controller.signal }
			)
				.then((res) => {
					if (!controller.signal.aborted) auditIssues = res.items;
				})
				.catch(() => {
					if (!controller.signal.aborted) auditIssues = [];
				});
		}, 400);

		return () => {
			controller.abort();
			clearTimeout(timer);
		};
	});

	const deleteDetail = $derived.by(() => {
		if (!transaction) return '';
		const label = deriveTransactionLabel(transaction);
		const withCat =
			transaction.category && label !== transaction.category
				? `${label} (${transaction.category})`
				: label;
		return `${withCat} · ${formatMoney(transaction.amount, transaction.currency)} · ${formatDate(transaction.occurred_on)}`;
	});

	/** AI-09 — alan başına doğrulanmış alıntılar; boş alıntılı (çıkarım) girdiler gösterilmez. */
	const EVIDENCE_LABELS: Record<TransactionEvidenceField, MessageKey> = {
		amount: 'finance.ai.draft.amount',
		currency: 'finance.ai.draft.currency',
		kind: 'finance.ai.draft.kind',
		occurred_on: 'finance.ai.draft.date',
		contact_id: 'finance.ai.draft.contact',
		contact_label: 'finance.ai.draft.contactLabel',
		payment_method: 'finance.ai.draft.paymentMethod',
		category: 'finance.ai.draft.category'
	};

	const sourceQuotes = $derived(
		visibleSourceQuotes(transaction?.source_evidence, (field) => t(EVIDENCE_LABELS[field]))
	);

	const dialogTitle = $derived(
		confirmingDelete
			? t('finance.deleteConfirmTitle')
			: isEdit
				? t('finance.form.editTitle')
				: t('finance.form.createTitle')
	);

	function paymentMethodLabel(value: string): string {
		if (value in paymentMethodMessageKeys) {
			return t(paymentMethodMessageKeys[value as keyof typeof paymentMethodMessageKeys]);
		}
		return value;
	}

	function selectContact(option: { value: string; label: string } | null) {
		if (option) contact_label = option.label;
	}

	function onCurrencyChange(e: Event) {
		const next = (e.currentTarget as HTMLSelectElement).value as SupportedCurrency;
		currency = next;
		amountBaseTouched = false;
		if (next === tenantBase) {
			amountBaseMajor = '';
			fxRate = '';
			fxDated = null;
		} else {
			amountBaseMajor = '';
			fxRate = '';
			fxDated = null;
		}
	}

	function onAmountBaseInput(e: Event) {
		const value = (e.currentTarget as HTMLInputElement).value;
		if (value.trim() === '') {
			amountBaseMajor = '';
			amountBaseTouched = false;
			return;
		}
		const rateSnapshot = displayFxRate;
		const datedSnapshot = displayFxDated;
		amountBaseMajor = value;
		fxRate = rateSnapshot;
		fxDated = datedSnapshot;
		amountBaseTouched = true;
	}

	function onFxRateInput(e: Event) {
		const value = (e.currentTarget as HTMLInputElement).value;
		const baseSnapshot = displayAmountBase;
		const datedSnapshot = displayFxDated;
		fxRate = value;
		amountBaseMajor = baseSnapshot;
		fxDated = datedSnapshot;
		amountBaseTouched = true;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (confirmingDelete) return;
		const amount = Math.round(Number.parseFloat(amountMajor.replace(',', '.')) * 100);
		if (!Number.isFinite(amount) || amount <= 0) return;

		let paid_amount: number | null = null;
		if (status === 'paid') {
			paid_amount = amount;
		} else if (status === 'partial') {
			const paid = Math.round(Number.parseFloat(paidMajor.replace(',', '.')) * 100);
			if (!Number.isFinite(paid) || paid < 0) return;
			paid_amount = Math.min(paid, amount);
		}

		let amount_base: number | null;
		let fx_rate: number | null;
		let fx_dated: string | null;
		if (!needsFx) {
			amount_base = amount;
			fx_rate = 1;
			fx_dated = occurred_on;
		} else if (displayAmountBase.trim() === '') {
			// FX provider down or user left blank — allow save; finance summary skips null base.
			amount_base = null;
			fx_rate = null;
			fx_dated = null;
		} else {
			amount_base = Math.round(Number.parseFloat(displayAmountBase.replace(',', '.')) * 100);
			if (!Number.isFinite(amount_base) || amount_base <= 0) return;
			const rate = Number.parseFloat(displayFxRate.replace(',', '.'));
			fx_rate = Number.isFinite(rate) && rate > 0 ? rate : null;
			fx_dated = displayFxDated ?? occurred_on;
		}

		const payload = {
			kind,
			title: null,
			subtitle: subtitle.trim() || null,
			category: category.trim() || null,
			occurred_on,
			status,
			invoice_status,
			payment_method: payment_method.trim() || null,
			amount,
			paid_amount,
			currency,
			amount_base,
			base_currency: tenantBase,
			fx_rate,
			fx_dated,
			contact_id: contact_id || null,
			contact_label: (() => {
				if (contact_id) {
					const name = contactsQuery.data?.items.find((c) => c.id === contact_id)?.display_name;
					return name ?? (contact_label.trim() || null);
				}
				return contact_label.trim() || null;
			})(),
			case_contact_id: case_contact_id || null,
			responsible_contact_id: responsible_contact_id || null,
			description: description.trim() || null
		};
		await onsubmit(payload);
	}

	function requestDelete() {
		deletePhase = 'confirm';
	}

	function cancelDelete() {
		deletePhase = 'form';
	}

	async function confirmDelete() {
		if (!ondelete) return;
		await runConfirmedDelete(deletePhase, () => Promise.resolve(ondelete()));
	}
</script>

<Dialog
	bind:open
	title={dialogTitle}
	description={confirmingDelete ? undefined : t('finance.form.description', { base: tenantBase })}
>
	{#if confirmingDelete}
		<div class="min-w-0 space-y-3">
			<p class="text-sm text-text">{t('finance.deleteConfirmBody')}</p>
			<p
				class="rounded-[6px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium break-words text-text"
			>
				{deleteDetail}
			</p>
			{#if error}
				<p class="text-sm text-danger">{error}</p>
			{/if}
		</div>
	{:else}
		<form id="tx-form" class="min-w-0 space-y-3" onsubmit={handleSubmit}>
			<div class="grid min-w-0 gap-3 sm:grid-cols-2">
				<div class="min-w-0">
					<label class={labelClass} for="tx-kind">{t('finance.form.kind')}</label>
					<select id="tx-kind" class={fieldClass} bind:value={kind}>
						{#each kinds as k (k)}
							<option value={k}>{transactionKindLabels[k]}</option>
						{/each}
					</select>
				</div>
				<div class="min-w-0">
					<label class={labelClass} for="tx-status">{t('finance.form.status')}</label>
					<select id="tx-status" class={fieldClass} bind:value={status}>
						{#each statuses as s (s)}
							<option value={s}>{transactionStatusLabels[s]}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="grid min-w-0 gap-3 sm:grid-cols-3">
				<div class="min-w-0">
					<label class={labelClass} for="tx-currency">{t('finance.form.currency')}</label>
					<select id="tx-currency" class={fieldClass} value={currency} onchange={onCurrencyChange}>
						{#each SUPPORTED_CURRENCIES as c (c)}
							<option value={c}>{c}</option>
						{/each}
					</select>
				</div>
				<div class="min-w-0">
					<label class={labelClass} for="tx-amount">{t('finance.form.amount', { currency })}</label>
					<input
						id="tx-amount"
						class={fieldClass}
						bind:value={amountMajor}
						inputmode="decimal"
						required
						placeholder={t('finance.form.moneyPlaceholder')}
					/>
				</div>
				<div class="min-w-0">
					<label class={labelClass} for="tx-date">{t('finance.form.date')}</label>
					<input id="tx-date" class={fieldClass} type="date" bind:value={occurred_on} required />
				</div>
			</div>
			{#if needsFx}
				<div
					class="grid min-w-0 gap-3 rounded-[6px] border border-warning/40 bg-warning/10 p-3 sm:grid-cols-2"
				>
					<div class="min-w-0">
						<label class={labelClass} for="tx-base"
							>{t('finance.form.baseAmount', { currency: tenantBase })}</label
						>
						<input
							id="tx-base"
							class={fieldClass}
							value={displayAmountBase}
							oninput={onAmountBaseInput}
							inputmode="decimal"
							placeholder={t('finance.form.moneyPlaceholder')}
							aria-busy={fxFetching}
						/>
						{#if fxFetching}
							<p class="mt-1 min-w-0 text-[11px] break-words text-text-faint">
								{t('finance.form.fxLoading')}
							</p>
						{:else if fxError}
							<p class="mt-1 min-w-0 text-[11px] break-words text-warning">
								{t('finance.form.fxError')}
							</p>
						{:else if displayFxDated}
							<p class="mt-1 min-w-0 text-[11px] break-words text-text-faint">
								{t('finance.form.fxDated', { date: displayFxDated })}
							</p>
						{:else}
							<p class="mt-1 min-w-0 text-[11px] break-words text-text-faint">
								{t('finance.form.fxLocked')}
							</p>
						{/if}
					</div>
					<div class="min-w-0">
						<label class={labelClass} for="tx-fx"
							>{t('finance.form.fxRate', { currency, base: tenantBase })}</label
						>
						<input
							id="tx-fx"
							class={fieldClass}
							value={displayFxRate}
							oninput={onFxRateInput}
							inputmode="decimal"
							placeholder={t('finance.form.fxPlaceholder')}
						/>
					</div>
				</div>
			{/if}
			{#if status === 'partial'}
				<div class="min-w-0">
					<label class={labelClass} for="tx-paid"
						>{t('finance.form.paidAmount', { currency })}</label
					>
					<input
						id="tx-paid"
						class={fieldClass}
						bind:value={paidMajor}
						inputmode="decimal"
						required
						placeholder={t('finance.form.moneyPlaceholder')}
					/>
				</div>
			{/if}
			<div class="grid min-w-0 gap-3 sm:grid-cols-2">
				<div class="min-w-0">
					<label class={labelClass} for="tx-category">{t('finance.form.category')}</label>
					{#if categoryOptions.length > 0}
						<select id="tx-category" class={fieldClass} bind:value={category}>
							<option value="">{t('finance.form.none')}</option>
							{#each categoryOptions as c (c.id)}
								<option value={c.name}>{c.name}</option>
							{/each}
						</select>
					{:else}
						<input id="tx-category" class={fieldClass} bind:value={category} maxlength={128} />
					{/if}
				</div>
				<div class="min-w-0">
					<label class={labelClass} for="tx-subtitle">{t('finance.form.subcategory')}</label>
					{#if subtitleOptions.length > 0}
						<select id="tx-subtitle" class={fieldClass} bind:value={subtitle}>
							<option value="">{t('finance.form.none')}</option>
							{#each subtitleOptions as s (s)}
								<option value={s}>{s}</option>
							{/each}
						</select>
					{:else}
						<input id="tx-subtitle" class={fieldClass} bind:value={subtitle} maxlength={255} />
					{/if}
				</div>
			</div>
			<div class="grid min-w-0 gap-3 sm:grid-cols-2">
				<div class="min-w-0">
					<label class={labelClass} for="tx-contact">{t('finance.form.contact')}</label>
					<Combobox
						id="tx-contact"
						bind:value={contact_id}
						options={contactOptions}
						placeholder={t('finance.form.contactSearchPlaceholder')}
						emptyText={t('finance.form.contactEmpty')}
						clearLabel={t('finance.form.contactClear')}
						onselect={selectContact}
					/>
				</div>
				<div class="min-w-0">
					<label class={labelClass} for="tx-contact-label"
						>{t('finance.form.contactFallback')}</label
					>
					<input
						id="tx-contact-label"
						class={fieldClass}
						bind:value={contact_label}
						maxlength={255}
						placeholder={t('finance.form.contactFreePlaceholder')}
						disabled={!!contact_id}
					/>
				</div>
			</div>
			<div class="grid min-w-0 gap-3 sm:grid-cols-2">
				<div class="min-w-0">
					<label class={labelClass} for="tx-case">{t('finance.form.case')}</label>
					<Combobox
						id="tx-case"
						bind:value={case_contact_id}
						options={caseContactOptions}
						placeholder={t('finance.form.caseSearchPlaceholder')}
						emptyText={t('finance.form.caseEmpty')}
						clearLabel={t('finance.form.caseClear')}
					/>
				</div>
				<div class="min-w-0">
					<label class={labelClass} for="tx-responsible">{t('finance.form.responsible')}</label>
					<Combobox
						id="tx-responsible"
						bind:value={responsible_contact_id}
						options={responsibleContactOptions}
						placeholder={t('finance.form.responsibleSearchPlaceholder')}
						emptyText={t('finance.form.responsibleEmpty')}
						clearLabel={t('finance.form.responsibleClear')}
					/>
				</div>
			</div>
			<div class="min-w-0">
				<label class={labelClass} for="tx-invoice">{t('finance.form.invoice')}</label>
				<select id="tx-invoice" class={fieldClass} bind:value={invoice_status}>
					{#each invoiceStatuses as s (s)}
						<option value={s}>{invoiceStatusLabels[s]}</option>
					{/each}
				</select>
			</div>
			<div class="min-w-0">
				<label class={labelClass} for="tx-method">{t('finance.form.paymentMethod')}</label>
				<select id="tx-method" class={fieldClass} bind:value={payment_method}>
					<option value="">{t('finance.form.paymentMethodNone')}</option>
					{#each paymentMethodOptions as method (method)}
						<option value={method}>{paymentMethodLabel(method)}</option>
					{/each}
				</select>
			</div>
			<div class="min-w-0">
				<label class={labelClass} for="tx-desc">{t('finance.form.descriptionLabel')}</label>
				<textarea id="tx-desc" class={textareaClass} bind:value={description} maxlength={8000}
				></textarea>
			</div>
			{#if transaction?.source_inbound_message_id}
				<!--
					AI-09 — bu satır elle mi girildi, WhatsApp'tan mı geldi.
					Bağ yalnız sunucunun yazdığı `source_inbound_message_id` varsa çıkar.
				-->
				<div class="min-w-0 rounded-[6px] border border-border bg-surface-2 px-3 py-2">
					<a
						class="inline-flex items-center gap-1 text-xs font-medium text-brand underline-offset-2 hover:underline"
						href="/finance/ai-transaction?inbox={transaction.source_inbound_message_id}"
					>
						{t('finance.ai.source.link')}
						<ArrowRight class="size-3" />
					</a>
					{#if sourceQuotes.length > 0}
						<ul class="mt-1.5 min-w-0 space-y-0.5">
							{#each sourceQuotes as q (q.field)}
								<li class="min-w-0 text-[11px] break-words text-text-faint">
									{q.label}: „{q.quote}“
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
			{#if error}
				<p class="min-w-0 text-sm break-words text-danger">{error}</p>
			{/if}
			{#if auditIssues.length > 0}
				<div
					class="min-w-0 space-y-1.5 rounded-[6px] border border-warning/40 bg-warning/10 px-3 py-2"
					role="status"
				>
					<p class="text-xs font-semibold text-text">{t('finance.form.auditTitle')}</p>
					<p class="text-[11px] break-words text-text-faint">{t('finance.form.auditHint')}</p>
					<ul class="min-w-0 space-y-1">
						{#each auditIssues as issue (issue.code + issue.message_key)}
							<li
								class="min-w-0 text-xs break-words {issue.severity === 'error'
									? 'text-danger'
									: 'text-warning'}"
							>
								{t(issue.message_key as MessageKey)}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</form>
	{/if}
	{#snippet footer()}
		{#if confirmingDelete}
			<Button variant="ghost" type="button" onclick={cancelDelete} disabled={saving}>
				{t('finance.deleteBack')}
			</Button>
			<Button
				variant="destructive"
				type="button"
				onclick={confirmDelete}
				disabled={saving || !ondelete}
			>
				{saving ? t('finance.deleting') : t('finance.deleteConfirmAction')}
			</Button>
		{:else}
			{#if isEdit && ondelete}
				<Button
					variant="outline"
					type="button"
					class="mr-auto text-danger hover:bg-danger/10 hover:text-danger"
					onclick={requestDelete}
					disabled={saving}
				>
					{t('finance.delete')}
				</Button>
			{/if}
			<Button variant="ghost" type="button" onclick={() => (open = false)} disabled={saving}
				>{t('common.cancel')}</Button
			>
			<Button type="submit" form="tx-form" disabled={saving || !amountMajor}>
				{saving ? t('common.saving') : isEdit ? t('common.save') : t('common.create')}
			</Button>
		{/if}
	{/snippet}
</Dialog>

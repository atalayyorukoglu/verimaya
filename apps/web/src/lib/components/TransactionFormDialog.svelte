<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type {
		Contact,
		FinanceCategory,
		InvoiceStatus,
		Patient,
		SupportedCurrency,
		Tenant,
		Transaction,
		TransactionCreate,
		TransactionKind,
		TransactionStatus,
		TransactionUpdate
	} from '@verimaya/shared';
	import {
		apiPaths,
		invoiceStatusLabels,
		SUPPORTED_CURRENCIES,
		toTenantDayKey,
		transactionKindLabels,
		transactionStatusLabels
	} from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass, listUrl, textareaClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import { formatDate, formatMoney } from '$lib/format';
	import { type DeleteConfirmPhase, runConfirmedDelete } from '$lib/components/delete-confirm-flow';

	let {
		open = $bindable(false),
		transaction = null,
		patients = [],
		defaultPatientId = null,
		saving = false,
		error = null,
		onsubmit,
		ondelete
	}: {
		open?: boolean;
		transaction?: Transaction | null;
		patients?: Patient[];
		defaultPatientId?: string | null;
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: TransactionCreate | TransactionUpdate) => void | Promise<void>;
		ondelete?: () => void | Promise<void>;
	} = $props();

	const kinds = Object.keys(transactionKindLabels) as TransactionKind[];
	const statuses = Object.keys(transactionStatusLabels) as TransactionStatus[];
	const invoiceStatuses = Object.keys(invoiceStatusLabels) as InvoiceStatus[];
	const qs = useQueryScope();

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
	let title = $state('');
	let subtitle = $state('');
	let category = $state('');
	let occurred_on = $state('');
	let status = $state<TransactionStatus>('unpaid');
	let invoice_status = $state<InvoiceStatus>('none');
	let currency = $state<SupportedCurrency>('TRY');
	let amountMajor = $state('');
	let amountBaseMajor = $state('');
	let fxRate = $state('');
	let paidMajor = $state('');
	let patient_id = $state('');
	let contact_id = $state('');
	let contact_label = $state('');
	let payment_method = $state('');
	let description = $state('');
	let deletePhase = $state<DeleteConfirmPhase>('form');

	const categoryOptions = $derived(
		(catsQuery.data?.items ?? [])
			.filter((c) => c.kind === kind)
			.sort((a, b) => a.sort_order - b.sort_order)
	);

	const selectedCategory = $derived(categoryOptions.find((c) => c.name === category) ?? null);
	const subtitleOptions = $derived(selectedCategory?.subcategories ?? []);
	const needsFx = $derived(currency !== tenantBase);

	$effect(() => {
		if (!open) {
			deletePhase = 'form';
			return;
		}
		kind = transaction?.kind ?? 'income';
		title = transaction?.title ?? '';
		subtitle = transaction?.subtitle ?? '';
		category = transaction?.category ?? '';
		occurred_on = transaction?.occurred_on ?? toTenantDayKey(new Date(), tenantTimezone);
		status = transaction?.status ?? 'unpaid';
		invoice_status = transaction?.invoice_status ?? 'none';
		currency = transaction?.currency ?? tenantBase;
		amountMajor = transaction ? String(transaction.amount / 100) : '';
		amountBaseMajor = transaction?.amount_base != null ? String(transaction.amount_base / 100) : '';
		fxRate = transaction?.fx_rate != null ? String(transaction.fx_rate) : '';
		paidMajor = transaction?.paid_amount != null ? String(transaction.paid_amount / 100) : '';
		patient_id = transaction?.patient_id ?? defaultPatientId ?? '';
		contact_id = transaction?.contact_id ?? '';
		contact_label = transaction?.contact_label ?? '';
		payment_method = transaction?.payment_method ?? '';
		description = transaction?.description ?? '';
		deletePhase = 'form';
	});

	const isEdit = $derived(!!transaction);
	const confirmingDelete = $derived(deletePhase === 'confirm');

	const deleteDetail = $derived.by(() => {
		if (!transaction) return '';
		const label = transaction.category
			? `${transaction.title} (${transaction.category})`
			: transaction.title;
		return `${label} · ${formatMoney(transaction.amount, transaction.currency)} · ${formatDate(transaction.occurred_on)}`;
	});

	const dialogTitle = $derived(
		confirmingDelete
			? t('finance.deleteConfirmTitle')
			: isEdit
				? t('finance.form.editTitle')
				: t('finance.form.createTitle')
	);

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
		if (!needsFx) {
			amount_base = amount;
			fx_rate = 1;
		} else {
			amount_base = Math.round(Number.parseFloat(amountBaseMajor.replace(',', '.')) * 100);
			if (!Number.isFinite(amount_base) || amount_base <= 0) return;
			const rate = Number.parseFloat(fxRate.replace(',', '.'));
			fx_rate = Number.isFinite(rate) && rate > 0 ? rate : null;
		}

		const payload = {
			kind,
			title: title.trim(),
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
			fx_dated: needsFx ? occurred_on : occurred_on,
			patient_id: patient_id || null,
			contact_id: contact_id || null,
			contact_label: (() => {
				if (contact_id) {
					const name = contactsQuery.data?.items.find((c) => c.id === contact_id)?.display_name;
					return name ?? (contact_label.trim() || null);
				}
				return contact_label.trim() || null;
			})(),
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
		<div class="space-y-3">
			<p class="text-sm text-text">{t('finance.deleteConfirmBody')}</p>
			<p
				class="rounded-[6px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-text"
			>
				{deleteDetail}
			</p>
			{#if error}
				<p class="text-sm text-danger">{error}</p>
			{/if}
		</div>
	{:else}
		<form id="tx-form" class="space-y-3" onsubmit={handleSubmit}>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class={labelClass} for="tx-kind">{t('finance.form.kind')}</label>
					<select id="tx-kind" class={fieldClass} bind:value={kind}>
						{#each kinds as k (k)}
							<option value={k}>{transactionKindLabels[k]}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class={labelClass} for="tx-status">Durum</label>
					<select id="tx-status" class={fieldClass} bind:value={status}>
						{#each statuses as s (s)}
							<option value={s}>{transactionStatusLabels[s]}</option>
						{/each}
					</select>
				</div>
			</div>
			<div>
				<label class={labelClass} for="tx-title">{t('finance.form.title')}</label>
				<input id="tx-title" class={fieldClass} bind:value={title} required maxlength={255} />
			</div>
			<div class="grid gap-3 sm:grid-cols-3">
				<div>
					<label class={labelClass} for="tx-currency">Para birimi</label>
					<select id="tx-currency" class={fieldClass} bind:value={currency}>
						{#each SUPPORTED_CURRENCIES as c (c)}
							<option value={c}>{c}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class={labelClass} for="tx-amount">Tutar ({currency})</label>
					<input
						id="tx-amount"
						class={fieldClass}
						bind:value={amountMajor}
						inputmode="decimal"
						required
						placeholder="0,00"
					/>
				</div>
				<div>
					<label class={labelClass} for="tx-date">Tarih</label>
					<input id="tx-date" class={fieldClass} type="date" bind:value={occurred_on} required />
				</div>
			</div>
			{#if needsFx}
				<div
					class="grid gap-3 rounded-[6px] border border-warning/40 bg-warning/10 p-3 sm:grid-cols-2"
				>
					<div>
						<label class={labelClass} for="tx-base">Baz tutar ({tenantBase})</label>
						<input
							id="tx-base"
							class={fieldClass}
							bind:value={amountBaseMajor}
							inputmode="decimal"
							required
							placeholder="0,00"
						/>
						<p class="mt-1 text-[11px] text-text-faint">{t('finance.form.fxLocked')}</p>
					</div>
					<div>
						<label class={labelClass} for="tx-fx">Kur (1 {currency} = ? {tenantBase})</label>
						<input
							id="tx-fx"
							class={fieldClass}
							bind:value={fxRate}
							inputmode="decimal"
							placeholder={t('finance.form.fxPlaceholder')}
						/>
					</div>
				</div>
			{/if}
			{#if status === 'partial'}
				<div>
					<label class={labelClass} for="tx-paid"
						>{t('finance.form.paidAmount', { currency })}</label
					>
					<input
						id="tx-paid"
						class={fieldClass}
						bind:value={paidMajor}
						inputmode="decimal"
						required
						placeholder="0,00"
					/>
				</div>
			{/if}
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class={labelClass} for="tx-category">Kategori</label>
					{#if categoryOptions.length > 0}
						<select id="tx-category" class={fieldClass} bind:value={category}>
							<option value="">—</option>
							{#each categoryOptions as c (c.id)}
								<option value={c.name}>{c.name}</option>
							{/each}
						</select>
					{:else}
						<input id="tx-category" class={fieldClass} bind:value={category} maxlength={128} />
					{/if}
				</div>
				<div>
					<label class={labelClass} for="tx-subtitle">Alt kategori</label>
					{#if subtitleOptions.length > 0}
						<select id="tx-subtitle" class={fieldClass} bind:value={subtitle}>
							<option value="">—</option>
							{#each subtitleOptions as s (s)}
								<option value={s}>{s}</option>
							{/each}
						</select>
					{:else}
						<input id="tx-subtitle" class={fieldClass} bind:value={subtitle} maxlength={255} />
					{/if}
				</div>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class={labelClass} for="tx-contact">{t('finance.form.contact')}</label>
					<select
						id="tx-contact"
						class={fieldClass}
						bind:value={contact_id}
						onchange={() => {
							if (!contact_id) return;
							const c = contactsQuery.data?.items.find((x) => x.id === contact_id);
							if (c) contact_label = c.display_name;
						}}
					>
						<option value="">— serbest etiket —</option>
						{#each contactsQuery.data?.items ?? [] as c (c.id)}
							<option value={c.id}>{c.display_name} ({c.contact_type_name})</option>
						{/each}
					</select>
				</div>
				<div>
					<label class={labelClass} for="tx-contact-label">Etiket (yedek)</label>
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
			<div>
				<label class={labelClass} for="tx-invoice">Fatura</label>
				<select id="tx-invoice" class={fieldClass} bind:value={invoice_status}>
					{#each invoiceStatuses as s (s)}
						<option value={s}>{invoiceStatusLabels[s]}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class={labelClass} for="tx-method">{t('finance.form.paymentMethod')}</label>
				<input id="tx-method" class={fieldClass} bind:value={payment_method} maxlength={64} />
			</div>
			<div>
				<label class={labelClass} for="tx-patient">Hasta (opsiyonel)</label>
				<select id="tx-patient" class={fieldClass} bind:value={patient_id}>
					<option value="">—</option>
					{#each patients as p (p.id)}
						<option value={p.id}>{p.full_name}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class={labelClass} for="tx-desc">{t('finance.form.descriptionLabel')}</label>
				<textarea id="tx-desc" class={textareaClass} bind:value={description} maxlength={8000}
				></textarea>
			</div>
			{#if error}
				<p class="text-sm text-danger">{error}</p>
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
			<Button
				type="submit"
				form="tx-form"
				disabled={saving || !title.trim() || !amountMajor || (needsFx && !amountBaseMajor)}
			>
				{saving ? t('common.saving') : isEdit ? t('common.save') : t('common.create')}
			</Button>
		{/if}
	{/snippet}
</Dialog>

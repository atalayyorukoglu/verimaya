<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		Appointment,
		AppointmentCreate,
		AppointmentUpdate,
		Contact,
		ContactAutoLinkTransactionsResult,
		ContactFinanceSummary,
		ContactUpdate,
		SupportedCurrency,
		Tenant,
		Transaction,
		TransactionCreate,
		TransactionUpdate
	} from '@verimaya/shared';
	import {
		apiPaths,
		appointmentStatusLabels,
		contactStatusLabels,
		listUrl,
		transactionKindLabels,
		transactionStatusLabels
	} from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { USE_MSW } from '$lib/env';
	import { formatDate, formatDateTime, formatMoney, formatTime } from '$lib/format';
	import {
		appointmentStatusTone,
		contactStatusTone,
		transactionStatusTone
	} from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import ContactFormDialog from '$lib/components/ContactFormDialog.svelte';
	import ContactFilesPanel from '$lib/components/ContactFilesPanel.svelte';
	import ContactCaseNotesThread from '$lib/components/ContactCaseNotesThread.svelte';
	import TransactionFormDialog from '$lib/components/TransactionFormDialog.svelte';
	import AppointmentFormDialog from '$lib/components/AppointmentFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import Pencil from '@lucide/svelte/icons/pencil';

	type PageOf<T> = { items: T[]; next_cursor: string | null };

	const queryClient = useQueryClient();
	const qs = useQueryScope();
	const id = $derived(page.params.id!);

	let formOpen = $state(false);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	let txFormOpen = $state(false);
	let editingTx = $state<Transaction | null>(null);
	let txSaving = $state(false);
	let txFormError = $state<string | null>(null);

	let apptFormOpen = $state(false);
	let editingAppt = $state<Appointment | null>(null);
	let apptSaving = $state(false);
	let apptFormError = $state<string | null>(null);

	let autoLinking = $state(false);
	let autoLinkMessage = $state<string | null>(null);
	let autoLinkError = $state<string | null>(null);

	const contactQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.detail(id),
		queryFn: () => apiGet<Contact>(apiPaths.contact(id)),
		enabled: qs.ready
	}));

	const txQuery = createQuery(() => ({
		queryKey: qs.keys.transactions.list({ contact_id: id, limit: 20 }),
		queryFn: () =>
			apiGet<PageOf<Transaction>>(listUrl('transactions', { limit: 20, contact_id: id })),
		enabled: qs.ready
	}));

	const apptQuery = createQuery(() => ({
		queryKey: qs.keys.appointments.list({ contact_id: id, limit: 20 }),
		queryFn: () =>
			apiGet<PageOf<Appointment>>(listUrl('appointments', { limit: 20, contact_id: id })),
		enabled: qs.ready
	}));

	const opsApptQuery = createQuery(() => ({
		queryKey: qs.keys.appointments.list({ limit: 100, for: 'contact-ops-roles' }),
		queryFn: () => apiGet<PageOf<Appointment>>(listUrl('appointments', { limit: 100 })),
		enabled: qs.ready
	}));

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>(apiPaths.tenantsCurrent),
		enabled: !USE_MSW && qs.ready
	}));

	const financeSummaryQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.financeSummary(id),
		queryFn: () => apiGet<ContactFinanceSummary>(apiPaths.contactFinanceSummary(id)),
		enabled: !USE_MSW && qs.ready
	}));

	const contact = $derived(contactQuery.data);
	const transactions = $derived(txQuery.data?.items ?? []);
	const appointments = $derived(apptQuery.data?.items ?? []);
	const baseCurrency = $derived((tenantQuery.data?.base_currency ?? 'TRY') as SupportedCurrency);

	const relatedAppointments = $derived(
		(opsApptQuery.data?.items ?? []).filter(
			(a) => a.clinic_contact_id === id || a.hotel_contact_id === id || a.transfer_contact_id === id
		)
	);

	const finance = $derived.by(() => {
		const byCurrency = new Map<string, { income: number; expense: number }>();
		const byCategory = new Map<string, number>();
		for (const tx of transactions) {
			const row = byCurrency.get(tx.currency) ?? { income: 0, expense: 0 };
			if (tx.kind === 'income') row.income += tx.amount;
			else row.expense += tx.amount;
			byCurrency.set(tx.currency, row);

			const cat = tx.category?.trim() || 'Kategorisiz';
			byCategory.set(cat, (byCategory.get(cat) ?? 0) + tx.amount);
		}
		const currencies = [...byCurrency.entries()].sort((a, b) => a[0].localeCompare(b[0]));
		const catMax = Math.max(1, ...byCategory.values());
		const categories = [...byCategory.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([name, amount]) => ({
				name,
				amount,
				pct: Math.round((amount / catMax) * 100)
			}));
		return { currencies, categories };
	});

	const documentTitle = $derived(
		t('contacts.detail.documentTitle', {
			name: contact?.display_name ?? t('contacts.detail.fallbackName')
		})
	);

	async function saveContact(data: ContactUpdate) {
		saving = true;
		formError = null;
		try {
			await apiSend(apiPaths.contact(id), 'PATCH', data);
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.all() });
			formOpen = false;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('common.saveFailed');
		} finally {
			saving = false;
		}
	}

	async function deleteContact() {
		saving = true;
		formError = null;
		try {
			await apiSend(apiPaths.contact(id), 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.all() });
			formOpen = false;
			await goto('/contacts');
		} catch (err) {
			formError = err instanceof Error ? err.message : t('contacts.deleteFailed');
		} finally {
			saving = false;
		}
	}

	function openCreateTx() {
		editingTx = null;
		txFormError = null;
		txFormOpen = true;
	}

	function openEditTx(tx: Transaction) {
		editingTx = tx;
		txFormError = null;
		txFormOpen = true;
	}

	async function saveTransaction(data: TransactionCreate | TransactionUpdate) {
		txSaving = true;
		txFormError = null;
		try {
			if (editingTx) {
				await apiSend(`/v1/transactions/${editingTx.id}`, 'PATCH', data);
			} else {
				await apiSend('/v1/transactions', 'POST', data);
			}
			await queryClient.invalidateQueries({ queryKey: qs.keys.transactions.all() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.financeSummary(id) });
			txFormOpen = false;
			editingTx = null;
		} catch (err) {
			txFormError = err instanceof Error ? err.message : t('common.saveFailed');
		} finally {
			txSaving = false;
		}
	}

	async function deleteTransaction() {
		if (!editingTx) return;
		txSaving = true;
		txFormError = null;
		try {
			await apiSend(apiPaths.transaction(editingTx.id), 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.transactions.all() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.financeSummary(id) });
			txFormOpen = false;
			editingTx = null;
		} catch (err) {
			txFormError = err instanceof Error ? err.message : t('finance.deleteFailed');
		} finally {
			txSaving = false;
		}
	}

	function openCreateAppt() {
		editingAppt = null;
		apptFormError = null;
		apptFormOpen = true;
	}

	function openEditAppt(appt: Appointment) {
		editingAppt = appt;
		apptFormError = null;
		apptFormOpen = true;
	}

	async function saveAppointment(data: AppointmentCreate | AppointmentUpdate) {
		apptSaving = true;
		apptFormError = null;
		try {
			if (editingAppt) {
				await apiSend(`/v1/appointments/${editingAppt.id}`, 'PATCH', data);
			} else {
				await apiSend('/v1/appointments', 'POST', data);
			}
			await queryClient.invalidateQueries({ queryKey: qs.keys.appointments.all() });
			apptFormOpen = false;
			editingAppt = null;
		} catch (err) {
			apptFormError = err instanceof Error ? err.message : t('common.saveFailed');
		} finally {
			apptSaving = false;
		}
	}

	async function deleteAppointment() {
		if (!editingAppt) return;
		apptSaving = true;
		apptFormError = null;
		try {
			await apiSend(apiPaths.appointment(editingAppt.id), 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.appointments.all() });
			apptFormOpen = false;
			editingAppt = null;
		} catch (err) {
			apptFormError = err instanceof Error ? err.message : t('appointments.deleteFailed');
		} finally {
			apptSaving = false;
		}
	}

	async function autoLinkTransactions() {
		autoLinking = true;
		autoLinkMessage = null;
		autoLinkError = null;
		try {
			const result = await apiSend<ContactAutoLinkTransactionsResult>(
				apiPaths.contactAutoLinkTransactions(id),
				'POST'
			);
			autoLinkMessage =
				result.updated > 0
					? t('contacts.finance.autoLinkSuccess', { count: String(result.updated) })
					: t('contacts.finance.autoLinkNone');
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: qs.keys.transactions.all() }),
				queryClient.invalidateQueries({ queryKey: qs.keys.contacts.financeSummary(id) })
			]);
		} catch (err) {
			autoLinkError = err instanceof Error ? err.message : t('contacts.finance.autoLinkFailed');
		} finally {
			autoLinking = false;
		}
	}

	function opsRoleLabel(appt: Appointment): string {
		const roles: string[] = [];
		if (appt.clinic_contact_id === id) roles.push(t('contacts.detail.roleClinic'));
		if (appt.hotel_contact_id === id) roles.push(t('contacts.detail.roleHotel'));
		if (appt.transfer_contact_id === id) roles.push(t('contacts.detail.roleTransfer'));
		return roles.join(' · ');
	}
</script>

<svelte:head>
	<title>{documentTitle}</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<a href="/contacts" class="mb-4 inline-block text-sm text-info hover:underline"
		>{t('contacts.detail.back')}</a
	>

	{#if contactQuery.isPending}
		<p class="text-sm text-text-muted">{t('common.loading')}</p>
	{:else if contactQuery.isError || !contact}
		<div class="rounded-lg border border-border bg-surface p-6">
			<p class="text-sm text-danger">{t('contacts.detail.notFound')}</p>
		</div>
	{:else}
		<PageHeader title={contact.display_name}>
			{#snippet actions()}
				<StatusBadge label={contact.contact_type_name} tone="neutral" />
				{#if contact.status}
					<StatusBadge
						label={contactStatusLabels[contact.status]}
						tone={contactStatusTone(contact.status)}
					/>
				{/if}
				{#if contact.is_internal}
					<StatusBadge label={t('contacts.detail.internalStaff')} tone="info" />
				{/if}
				<Button type="button" variant="secondary" onclick={() => (formOpen = true)}
					>{t('common.edit')}</Button
				>
			{/snippet}
		</PageHeader>

		<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">{t('contacts.finance.title')}</h2>
				<div class="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						size="sm"
						variant="secondary"
						disabled={autoLinking}
						onclick={autoLinkTransactions}
					>
						{autoLinking ? t('contacts.finance.autoLinking') : t('contacts.finance.autoLink')}
					</Button>
					<a href="/finance/balances" class="text-xs font-medium text-brand hover:underline">
						{t('contacts.finance.balancesLink')}
					</a>
					<a
						href={`/finance?contact=${contact.id}`}
						class="text-xs font-medium text-brand hover:underline"
					>
						{t('contacts.finance.openInTransactions')}
					</a>
				</div>
			</div>

			{#if autoLinkMessage}
				<p class="mb-3 text-sm text-success">{autoLinkMessage}</p>
			{/if}
			{#if autoLinkError}
				<p class="mb-3 text-sm text-danger">{autoLinkError}</p>
			{/if}

			{#if !USE_MSW && financeSummaryQuery.isPending}
				<p class="text-sm text-text-muted">{t('contacts.finance.loading')}</p>
			{:else if !USE_MSW && financeSummaryQuery.data}
				{@const summary = financeSummaryQuery.data}
				<div class="grid grid-cols-3 gap-3">
					<div>
						<p class="text-xs text-text-muted">{t('contacts.finance.incomeLabel')}</p>
						<p class="mt-1 text-base font-semibold text-success tabular-nums">
							+{formatMoney(summary.income_base, baseCurrency)}
						</p>
					</div>
					<div>
						<p class="text-xs text-text-muted">{t('contacts.finance.expenseLabel')}</p>
						<p class="mt-1 text-base font-semibold text-danger tabular-nums">
							−{formatMoney(summary.expense_base, baseCurrency)}
						</p>
					</div>
					<div>
						<p class="text-xs text-text-muted">{t('contacts.finance.netLabel')}</p>
						<p
							class="mt-1 text-base font-semibold tabular-nums {summary.net_base >= 0
								? 'text-text'
								: 'text-danger'}"
						>
							{formatMoney(summary.net_base, baseCurrency)}
						</p>
					</div>
				</div>
				{#if summary.transaction_count === 0}
					<p class="mt-3 text-sm text-text-muted">{t('contacts.finance.empty')}</p>
				{:else}
					<div class="mt-3 grid grid-cols-2 gap-3">
						<div>
							<p class="text-xs text-text-muted">
								{t('contacts.finance.collected', { currency: baseCurrency })}
							</p>
							<p class="mt-1 text-sm font-semibold text-text tabular-nums">
								{formatMoney(summary.paid_base, baseCurrency)}
							</p>
						</div>
						<div>
							<p class="text-xs text-text-muted">
								{t('contacts.finance.outstanding', { currency: baseCurrency })}
							</p>
							<p class="mt-1 text-sm font-semibold text-warning tabular-nums">
								{formatMoney(summary.outstanding_base, baseCurrency)}
							</p>
						</div>
					</div>
				{/if}
			{:else if txQuery.isPending}
				<p class="text-sm text-text-muted">{t('contacts.finance.loading')}</p>
			{:else if finance.currencies.length === 0}
				<div class="grid grid-cols-3 gap-3">
					<div>
						<p class="text-xs text-text-muted">{t('contacts.finance.incomeLabel')}</p>
						<p class="mt-1 text-base font-semibold text-success tabular-nums">
							+{formatMoney(0, baseCurrency)}
						</p>
					</div>
					<div>
						<p class="text-xs text-text-muted">{t('contacts.finance.expenseLabel')}</p>
						<p class="mt-1 text-base font-semibold text-danger tabular-nums">
							−{formatMoney(0, baseCurrency)}
						</p>
					</div>
					<div>
						<p class="text-xs text-text-muted">{t('contacts.finance.netLabel')}</p>
						<p class="mt-1 text-base font-semibold text-text tabular-nums">
							{formatMoney(0, baseCurrency)}
						</p>
					</div>
				</div>
				<p class="mt-3 text-sm text-text-muted">{t('contacts.finance.empty')}</p>
			{:else}
				{#each finance.currencies as [currency, totals] (currency)}
					{@const net = totals.income - totals.expense}
					<div class="mb-3 last:mb-0">
						<div class="grid grid-cols-3 gap-3">
							<div>
								<p class="text-xs text-text-muted">{t('contacts.finance.incomeLabel')}</p>
								<p class="mt-1 text-base font-semibold text-success tabular-nums">
									+{formatMoney(totals.income, currency)}
								</p>
							</div>
							<div>
								<p class="text-xs text-text-muted">{t('contacts.finance.expenseLabel')}</p>
								<p class="mt-1 text-base font-semibold text-danger tabular-nums">
									−{formatMoney(totals.expense, currency)}
								</p>
							</div>
							<div>
								<p class="text-xs text-text-muted">{t('contacts.finance.netLabel')}</p>
								<p
									class="mt-1 text-base font-semibold tabular-nums {net >= 0
										? 'text-text'
										: 'text-danger'}"
								>
									{formatMoney(net, currency)}
								</p>
							</div>
						</div>
					</div>
				{/each}

				{#if USE_MSW && finance.categories.length > 0}
					<div class="mt-4 border-t border-border pt-4">
						<h3 class="mb-3 text-xs font-semibold tracking-wide text-text-muted uppercase">
							{t('contacts.detail.categoryBreakdown')}
						</h3>
						<ul class="space-y-2">
							{#each finance.categories as row (row.name)}
								<li>
									<div class="flex items-center justify-between gap-2 text-xs">
										<span class="truncate text-text">{row.name}</span>
										<span class="shrink-0 text-text-muted tabular-nums">
											{formatMoney(row.amount)}
										</span>
									</div>
									<div class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
										<div class="h-full rounded-full bg-brand" style="width: {row.pct}%"></div>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}
		</section>

		<dl
			class="mb-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
		>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">{t('contacts.detail.phone')}</dt>
				<dd class="text-sm break-all text-text tabular-nums">{contact.phone ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">{t('contacts.detail.email')}</dt>
				<dd class="text-sm break-all text-text">{contact.email ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">{t('contacts.detail.source')}</dt>
				<dd class="text-sm break-words text-text">{contact.source ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">{t('contacts.detail.medium')}</dt>
				<dd class="text-sm break-words text-text">{contact.medium ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">{t('contacts.detail.campaign')}</dt>
				<dd class="text-sm break-words text-text">{contact.campaign ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">{t('common.createdAt')}</dt>
				<dd class="text-sm text-text">{formatDateTime(contact.created_at)}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-start">
				<dt class="text-xs font-medium text-text-muted">{t('contacts.detail.notes')}</dt>
				<dd class="text-sm break-words whitespace-pre-wrap text-text">{contact.notes ?? '—'}</dd>
			</div>
		</dl>

		<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">{t('contacts.detail.appointments')}</h2>
				<div class="flex flex-wrap items-center gap-2">
					<a
						href={`/appointments?contact=${contact.id}`}
						class="text-xs font-medium text-brand hover:underline"
						>{t('contacts.detail.calendarLink')}</a
					>
					<Button type="button" size="sm" variant="secondary" onclick={openCreateAppt}
						>{t('contacts.detail.newAppointment')}</Button
					>
				</div>
			</div>
			{#if apptQuery.isPending}
				<p class="text-sm text-text-muted">{t('common.loading')}</p>
			{:else if appointments.length === 0}
				<p class="text-sm text-text-muted">{t('contacts.detail.appointmentsEmpty')}</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each appointments as appt (appt.id)}
						<li class="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
							<button
								type="button"
								class="min-w-0 flex-1 cursor-pointer text-left"
								onclick={() => openEditAppt(appt)}
							>
								<p class="truncate text-sm font-medium text-text hover:text-brand">
									{appt.title ?? appt.appointment_type ?? t('contacts.files.appointmentFallback')}
								</p>
								<p class="text-xs text-text-faint">
									{formatDate(appt.starts_at)} · {formatTime(appt.starts_at)}
								</p>
							</button>
							<StatusBadge
								label={appointmentStatusLabels[appt.status]}
								tone={appointmentStatusTone(appt.status)}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">{t('contacts.detail.transactions')}</h2>
				<div class="flex flex-wrap items-center gap-2">
					<a
						href={`/finance?contact=${contact.id}`}
						class="text-xs font-medium text-brand hover:underline"
					>
						{t('contacts.detail.allLink')}
					</a>
					<Button type="button" size="sm" variant="secondary" onclick={openCreateTx}
						>{t('contacts.detail.newTransaction')}</Button
					>
				</div>
			</div>
			{#if txQuery.isPending}
				<p class="text-sm text-text-muted">{t('contacts.finance.loading')}</p>
			{:else if transactions.length === 0}
				<p class="text-sm text-text-muted">{t('contacts.detail.transactionsEmpty')}</p>
			{:else}
				<ul class="-mx-1 divide-y divide-border">
					{#each transactions as tx (tx.id)}
						<li class="group">
							<div
								class="flex min-w-0 items-start gap-3 rounded-[6px] px-1 py-3 transition-colors hover:bg-surface-2/70"
							>
								<button
									type="button"
									class="min-w-0 flex-1 cursor-pointer text-left"
									onclick={() => openEditTx(tx)}
								>
									<p class="truncate text-sm font-medium text-text group-hover:text-brand">
										{tx.title}
									</p>
									<p class="text-xs text-text-faint">
										{formatDate(tx.occurred_on)} · {transactionKindLabels[tx.kind]}
										{#if tx.category}
											· {tx.category}
										{/if}
									</p>
									<div class="mt-1.5">
										<StatusBadge
											label={transactionStatusLabels[tx.status]}
											tone={transactionStatusTone(tx.status)}
										/>
									</div>
								</button>
								<div class="flex shrink-0 flex-col items-end gap-2 pt-0.5">
									<p
										class="text-sm font-semibold tabular-nums {tx.kind === 'income'
											? 'text-success'
											: 'text-text'}"
									>
										{tx.kind === 'expense' ? '−' : '+'}{formatMoney(tx.amount, tx.currency)}
									</p>
									<Button
										type="button"
										variant="outline"
										size="sm"
										class="h-7 gap-1 px-2 text-xs"
										onclick={() => openEditTx(tx)}
									>
										<Pencil class="size-3" />
										{t('common.edit')}
									</Button>
								</div>
							</div>
						</li>
					{/each}
				</ul>
				{#if txQuery.data?.next_cursor}
					<p class="mt-3 text-xs text-text-faint">
						{t('contacts.detail.moreTransactions')}
						<a href={`/finance?contact=${contact.id}`} class="text-brand hover:underline"
							>{t('contacts.detail.viewInFinance')}</a
						>
					</p>
				{/if}
			{/if}
		</section>

		<ContactFilesPanel contactId={contact.id} {appointments} />

		<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
			<h2 class="mb-3 text-sm font-semibold text-text">{t('contacts.notes.aria')}</h2>
			<ContactCaseNotesThread contactId={contact.id} />
		</section>

		{#if relatedAppointments.length > 0}
			<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
				<h2 class="mb-3 text-sm font-semibold text-text">{t('contacts.detail.opsRolesTitle')}</h2>
				{#if opsApptQuery.isPending}
					<p class="text-sm text-text-muted">{t('common.loading')}</p>
				{:else}
					<ul class="divide-y divide-border">
						{#each relatedAppointments as a (a.id)}
							<li class="py-2.5">
								<p class="text-sm font-medium">{a.contact_display_name}</p>
								<p class="text-xs text-text-faint">
									{formatDate(a.starts_at)} · {formatTime(a.starts_at)} · {opsRoleLabel(a)}
								</p>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<ContactFormDialog
			bind:open={formOpen}
			{contact}
			{saving}
			error={formError}
			onsubmit={saveContact}
			ondelete={deleteContact}
		/>

		<TransactionFormDialog
			bind:open={txFormOpen}
			transaction={editingTx}
			defaultContactId={contact.id}
			saving={txSaving}
			error={txFormError}
			onsubmit={saveTransaction}
			ondelete={editingTx ? deleteTransaction : undefined}
		/>

		<AppointmentFormDialog
			bind:open={apptFormOpen}
			appointment={editingAppt}
			contacts={[contact]}
			defaultContactId={contact.id}
			saving={apptSaving}
			error={apptFormError}
			onsubmit={saveAppointment}
			ondelete={editingAppt ? deleteAppointment : undefined}
		/>
	{/if}
</div>

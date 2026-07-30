<script lang="ts">
	import { page } from '$app/state';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		Appointment,
		AppointmentCreate,
		AppointmentUpdate,
		Patient,
		PatientFinanceSummary,
		PatientUpdate,
		SupportedCurrency,
		Tenant,
		Transaction,
		TransactionCreate,
		TransactionUpdate
	} from '@verimaya/shared';
	import {
		appointmentStatusLabels,
		patientStatusLabels,
		transactionKindLabels,
		transactionStatusLabels
	} from '@verimaya/shared';
	import { apiPaths, listUrl } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { USE_MSW } from '$lib/env';
	import { formatDate, formatDateTime, formatMoney, formatTime } from '$lib/format';
	import {
		appointmentStatusTone,
		patientStatusTone,
		transactionStatusTone
	} from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import PatientFormDialog from '$lib/components/PatientFormDialog.svelte';
	import PatientFilesPanel from '$lib/components/PatientFilesPanel.svelte';
	import TransactionFormDialog from '$lib/components/TransactionFormDialog.svelte';
	import AppointmentFormDialog from '$lib/components/AppointmentFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import Pencil from '@lucide/svelte/icons/pencil';

	type PageOf<T> = { items: T[]; next_cursor: string | null };

	const queryClient = useQueryClient();
	const id = $derived(page.params.id!);

	let patientFormOpen = $state(false);
	let patientSaving = $state(false);
	let patientFormError = $state<string | null>(null);

	let txFormOpen = $state(false);
	let editingTx = $state<Transaction | null>(null);
	let txSaving = $state(false);
	let txFormError = $state<string | null>(null);

	let apptFormOpen = $state(false);
	let editingAppt = $state<Appointment | null>(null);
	let apptSaving = $state(false);
	let apptFormError = $state<string | null>(null);

	const patientQuery = createQuery(() => ({
		queryKey: ['patients', id],
		queryFn: () => apiGet<Patient>(apiPaths.patient(id))
	}));

	const txQuery = createQuery(() => ({
		queryKey: ['transactions', { patient_id: id, limit: 20 }],
		queryFn: () =>
			apiGet<PageOf<Transaction>>(listUrl('transactions', { limit: 20, patient_id: id }))
	}));

	const apptQuery = createQuery(() => ({
		queryKey: ['appointments', { patient_id: id, limit: 20 }],
		queryFn: () =>
			apiGet<PageOf<Appointment>>(listUrl('appointments', { limit: 20, patient_id: id }))
	}));

	const tenantQuery = createQuery(() => ({
		queryKey: ['tenants', 'current'],
		queryFn: () => apiGet<Tenant>(apiPaths.tenantsCurrent),
		enabled: !USE_MSW
	}));

	const financeSummaryQuery = createQuery(() => ({
		queryKey: ['patients', id, 'finance-summary'],
		queryFn: () => apiGet<PatientFinanceSummary>(apiPaths.patientFinanceSummary(id)),
		enabled: !USE_MSW
	}));

	const transactions = $derived(txQuery.data?.items ?? []);
	const appointments = $derived(apptQuery.data?.items ?? []);
	const baseCurrency = $derived(
		(tenantQuery.data?.base_currency ?? 'TRY') as SupportedCurrency
	);

	const finance = $derived.by(() => {
		const byCurrency = new Map<string, { income: number; expense: number }>();
		const byCategory = new Map<string, number>();
		for (const t of transactions) {
			const row = byCurrency.get(t.currency) ?? { income: 0, expense: 0 };
			if (t.kind === 'income') row.income += t.amount;
			else row.expense += t.amount;
			byCurrency.set(t.currency, row);

			const cat = t.category?.trim() || 'Kategorisiz';
			byCategory.set(cat, (byCategory.get(cat) ?? 0) + t.amount);
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

	async function updatePatient(data: PatientUpdate) {
		patientSaving = true;
		patientFormError = null;
		try {
			await apiSend<Patient>(apiPaths.patient(id), 'PATCH', data);
			await queryClient.invalidateQueries({ queryKey: ['patients'] });
			patientFormOpen = false;
		} catch (err) {
			patientFormError = err instanceof Error ? err.message : 'Kayıt başarısız';
		} finally {
			patientSaving = false;
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
			await queryClient.invalidateQueries({ queryKey: ['transactions'] });
			txFormOpen = false;
			editingTx = null;
		} catch (err) {
			txFormError = err instanceof Error ? err.message : 'Kayıt başarısız';
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
			await queryClient.invalidateQueries({ queryKey: ['appointments'] });
			apptFormOpen = false;
			editingAppt = null;
		} catch (err) {
			apptFormError = err instanceof Error ? err.message : 'Kayıt başarısız';
		} finally {
			apptSaving = false;
		}
	}
</script>

<svelte:head>
	<title>
		{patientQuery.data?.full_name ?? 'Hasta'} · Verimaya
	</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<a href="/patients" class="mb-4 inline-block text-sm text-info hover:underline">← Hastalar</a>

	{#if patientQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if patientQuery.isError}
		<div class="rounded-lg border border-border bg-surface p-6">
			<p class="text-sm text-danger">Hasta bulunamadı veya yüklenemedi.</p>
		</div>
	{:else if patientQuery.data}
		{@const patient = patientQuery.data}
		<PageHeader title={patient.full_name}>
			{#snippet actions()}
				<StatusBadge
					label={patientStatusLabels[patient.status]}
					tone={patientStatusTone(patient.status)}
				/>
				<Button type="button" variant="secondary" onclick={() => (patientFormOpen = true)}
					>Düzenle</Button
				>
			{/snippet}
		</PageHeader>

		<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">Finans özeti</h2>
				<a
					href={`/finance?hasta=${patient.id}`}
					class="text-xs font-medium text-brand hover:underline"
				>
					İşlemlerde aç →
				</a>
			</div>

			{#if !USE_MSW && financeSummaryQuery.isPending}
				<p class="text-sm text-text-muted">Yükleniyor…</p>
			{:else if !USE_MSW && financeSummaryQuery.data}
				{@const summary = financeSummaryQuery.data}
				{#if summary.transaction_count === 0}
					<p class="text-sm text-text-muted">Bu hastaya bağlı işlem yok.</p>
				{:else}
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<div>
							<p class="text-xs text-text-muted">Gelir ({baseCurrency})</p>
							<p class="mt-1 text-base font-semibold text-success tabular-nums">
								+{formatMoney(summary.income_base, baseCurrency)}
							</p>
						</div>
						<div>
							<p class="text-xs text-text-muted">Gider ({baseCurrency})</p>
							<p class="mt-1 text-base font-semibold text-danger tabular-nums">
								−{formatMoney(summary.expense_base, baseCurrency)}
							</p>
						</div>
						<div>
							<p class="text-xs text-text-muted">Tahsil ({baseCurrency})</p>
							<p class="mt-1 text-base font-semibold text-text tabular-nums">
								{formatMoney(summary.paid_base, baseCurrency)}
							</p>
						</div>
						<div>
							<p class="text-xs text-text-muted">Bekleyen ({baseCurrency})</p>
							<p class="mt-1 text-base font-semibold text-warning tabular-nums">
								{formatMoney(summary.outstanding_base, baseCurrency)}
							</p>
						</div>
					</div>
				{/if}
			{:else if txQuery.isPending}
				<p class="text-sm text-text-muted">Yükleniyor…</p>
			{:else if finance.currencies.length === 0}
				<p class="text-sm text-text-muted">Bu hastaya bağlı işlem yok.</p>
			{:else}
				{#each finance.currencies as [currency, totals] (currency)}
					<div class="mb-3 grid grid-cols-3 gap-3 last:mb-0">
						<div>
							<p class="text-xs text-text-muted">Gelir ({currency})</p>
							<p class="mt-1 text-base font-semibold text-success tabular-nums">
								+{formatMoney(totals.income, currency)}
							</p>
						</div>
						<div>
							<p class="text-xs text-text-muted">Gider ({currency})</p>
							<p class="mt-1 text-base font-semibold text-danger tabular-nums">
								−{formatMoney(totals.expense, currency)}
							</p>
						</div>
						<div>
							<p class="text-xs text-text-muted">Net ({currency})</p>
							<p
								class="mt-1 text-base font-semibold tabular-nums {totals.income - totals.expense >=
								0
									? 'text-text'
									: 'text-danger'}"
							>
								{formatMoney(totals.income - totals.expense, currency)}
							</p>
						</div>
					</div>
				{/each}

				{#if USE_MSW && finance.categories.length > 0}
					<div class="mt-4 border-t border-border pt-4">
						<h3 class="mb-3 text-xs font-semibold tracking-wide text-text-muted uppercase">
							Kategori dağılımı
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
				<dt class="text-xs font-medium text-text-muted">Telefon</dt>
				<dd class="text-sm break-all text-text tabular-nums">{patient.phone ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">E-posta</dt>
				<dd class="text-sm break-all text-text">{patient.email ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">Kaynak</dt>
				<dd class="text-sm break-words text-text">{patient.source ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">Oluşturulma</dt>
				<dd class="text-sm text-text">{formatDateTime(patient.created_at)}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-start">
				<dt class="text-xs font-medium text-text-muted">Notlar</dt>
				<dd class="text-sm break-words whitespace-pre-wrap text-text">{patient.notes ?? '—'}</dd>
			</div>
		</dl>

		<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">Randevular</h2>
				<div class="flex flex-wrap items-center gap-2">
					<a
						href={`/appointments?hasta=${patient.id}`}
						class="text-xs font-medium text-brand hover:underline">Takvim →</a
					>
					<Button type="button" size="sm" variant="secondary" onclick={openCreateAppt}
						>Yeni randevu</Button
					>
				</div>
			</div>
			{#if apptQuery.isPending}
				<p class="text-sm text-text-muted">Yükleniyor…</p>
			{:else if appointments.length === 0}
				<p class="text-sm text-text-muted">Randevu yok.</p>
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
									{appt.title ?? appt.appointment_type ?? 'Randevu'}
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
				<h2 class="text-sm font-semibold text-text">İşlemler</h2>
				<div class="flex flex-wrap items-center gap-2">
					<a
						href={`/finance?hasta=${patient.id}`}
						class="text-xs font-medium text-brand hover:underline"
					>
						Tümü →
					</a>
					<Button type="button" size="sm" variant="secondary" onclick={openCreateTx}
						>Yeni işlem</Button
					>
				</div>
			</div>
			{#if txQuery.isPending}
				<p class="text-sm text-text-muted">Yükleniyor…</p>
			{:else if transactions.length === 0}
				<p class="text-sm text-text-muted">İşlem yok.</p>
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
										Düzenle
									</Button>
								</div>
							</div>
						</li>
					{/each}
				</ul>
				{#if txQuery.data?.next_cursor}
					<p class="mt-3 text-xs text-text-faint">
						Daha fazla işlem var —
						<a href={`/finance?hasta=${patient.id}`} class="text-brand hover:underline"
							>İşlemlerde gör</a
						>
					</p>
				{/if}
			{/if}
		</section>

		<PatientFilesPanel patientId={patient.id} {appointments} />

		<PatientFormDialog
			bind:open={patientFormOpen}
			{patient}
			saving={patientSaving}
			error={patientFormError}
			onsubmit={updatePatient}
		/>

		<TransactionFormDialog
			bind:open={txFormOpen}
			transaction={editingTx}
			patients={[patient]}
			defaultPatientId={patient.id}
			saving={txSaving}
			error={txFormError}
			onsubmit={saveTransaction}
		/>

		<AppointmentFormDialog
			bind:open={apptFormOpen}
			appointment={editingAppt}
			patients={[patient]}
			defaultPatientId={patient.id}
			saving={apptSaving}
			error={apptFormError}
			onsubmit={saveAppointment}
		/>
	{/if}
</div>

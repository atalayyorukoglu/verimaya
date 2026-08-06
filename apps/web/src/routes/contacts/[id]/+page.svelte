<script lang="ts">
	import { page } from '$app/state';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { Appointment, Contact, ContactUpdate, Patient, Transaction } from '@verimaya/shared';
	import { apiPaths, transactionKindLabels } from '@verimaya/shared';
	import { apiGet, apiSend, listUrl } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDate, formatMoney, formatTime } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import ContactFormDialog from '$lib/components/ContactFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';

	type PageOf<T> = { items: T[]; next_cursor: string | null };

	const queryClient = useQueryClient();
	const { keys, ready } = useQueryScope();
	const id = $derived(page.params.id!);

	let formOpen = $state(false);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	const contactQuery = createQuery(() => ({
		queryKey: keys.contacts.detail(id),
		queryFn: () => apiGet<Contact>(apiPaths.contact(id)),
		enabled: ready
	}));

	const txQuery = createQuery(() => ({
		queryKey: keys.transactions.list({ contact_id: id, limit: 20 }),
		queryFn: () =>
			apiGet<PageOf<Transaction>>(listUrl('transactions', { limit: 20, contact_id: id })),
		enabled: ready
	}));

	const apptQuery = createQuery(() => ({
		queryKey: keys.appointments.list({ limit: 100, for: 'contact-profile' }),
		queryFn: () => apiGet<PageOf<Appointment>>(listUrl('appointments', { limit: 100 })),
		enabled: ready
	}));

	const patientsQuery = createQuery(() => ({
		queryKey: keys.patients.list({ limit: 100, for: 'contact-link' }),
		queryFn: () => apiGet<PageOf<Patient>>(listUrl('patients', { limit: 100 })),
		enabled: ready
	}));

	const contact = $derived(contactQuery.data);
	const linkedPatient = $derived(
		(patientsQuery.data?.items ?? []).find((p) => p.contact_id === id) ?? null
	);

	const relatedAppointments = $derived(
		(apptQuery.data?.items ?? []).filter(
			(a) => a.clinic_contact_id === id || a.hotel_contact_id === id || a.transfer_contact_id === id
		)
	);

	const finance = $derived.by(() => {
		let income = 0;
		let expense = 0;
		for (const t of txQuery.data?.items ?? []) {
			if (t.kind === 'income') income += t.amount;
			else expense += t.amount;
		}
		return { income, expense, net: income - expense };
	});

	async function saveContact(data: ContactUpdate) {
		saving = true;
		formError = null;
		try {
			await apiSend(apiPaths.contact(id), 'PATCH', data);
			await queryClient.invalidateQueries({ queryKey: keys.contacts.all() });
			await queryClient.invalidateQueries({ queryKey: keys.patients.all() });
			formOpen = false;
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Kayıt başarısız';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{contact?.display_name ?? 'Kişi'} · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<a href="/contacts" class="mb-4 inline-block text-sm text-info hover:underline">← Kişiler</a>

	{#if contactQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if contactQuery.isError || !contact}
		<p class="text-sm text-danger">Kişi bulunamadı.</p>
	{:else}
		<PageHeader title={contact.display_name}>
			{#snippet actions()}
				<StatusBadge label={contact.contact_type_name} tone="neutral" />
				{#if contact.is_internal}
					<StatusBadge label="İç personel" tone="info" />
				{/if}
				<Button type="button" variant="secondary" onclick={() => (formOpen = true)}>Düzenle</Button>
			{/snippet}
		</PageHeader>

		<dl
			class="mb-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
		>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
				<dt class="text-xs font-medium text-text-muted">Telefon</dt>
				<dd class="text-sm tabular-nums">{contact.phone ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
				<dt class="text-xs font-medium text-text-muted">E-posta</dt>
				<dd class="text-sm break-all">{contact.email ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr]">
				<dt class="text-xs font-medium text-text-muted">Kullanım</dt>
				<dd class="text-sm">{contact.usage_count} kayıt</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-start">
				<dt class="text-xs font-medium text-text-muted">Notlar</dt>
				<dd class="text-sm whitespace-pre-wrap">{contact.notes ?? '—'}</dd>
			</div>
		</dl>

		{#if linkedPatient}
			<section class="mb-4 rounded-lg border border-border bg-surface p-4">
				<h2 class="mb-2 text-sm font-semibold">Bağlı hasta</h2>
				<a
					href={`/patients/${linkedPatient.id}`}
					class="text-sm font-medium text-brand hover:underline"
				>
					{linkedPatient.full_name} →
				</a>
			</section>
		{/if}

		<section class="mb-4 rounded-lg border border-border bg-surface p-4">
			<div class="mb-3 flex items-center justify-between gap-2">
				<h2 class="text-sm font-semibold">Finans özeti</h2>
				<a href="/finance/balances" class="text-xs text-brand hover:underline">Bakiyeler →</a>
			</div>
			{#if txQuery.isPending}
				<p class="text-sm text-text-muted">Yükleniyor…</p>
			{:else}
				<div class="mb-3 grid grid-cols-3 gap-3">
					<div>
						<p class="text-xs text-text-muted">Gelir</p>
						<p class="text-base font-semibold text-success tabular-nums">
							+{formatMoney(finance.income)}
						</p>
					</div>
					<div>
						<p class="text-xs text-text-muted">Gider</p>
						<p class="text-base font-semibold text-danger tabular-nums">
							−{formatMoney(finance.expense)}
						</p>
					</div>
					<div>
						<p class="text-xs text-text-muted">Net</p>
						<p class="text-base font-semibold tabular-nums">{formatMoney(finance.net)}</p>
					</div>
				</div>
				{#if (txQuery.data?.items ?? []).length === 0}
					<p class="text-sm text-text-muted">Bu kişiye bağlı işlem yok.</p>
				{:else}
					<ul class="divide-y divide-border">
						{#each txQuery.data?.items ?? [] as t (t.id)}
							<li class="flex justify-between gap-3 py-2.5">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium">{t.title}</p>
									<p class="text-xs text-text-faint">
										{formatDate(t.occurred_on)} · {transactionKindLabels[t.kind]}
									</p>
								</div>
								<p
									class="shrink-0 text-sm font-semibold tabular-nums {t.kind === 'income'
										? 'text-success'
										: 'text-text'}"
								>
									{t.kind === 'expense' ? '−' : '+'}{formatMoney(t.amount, t.currency)}
								</p>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</section>

		<section class="mb-4 rounded-lg border border-border bg-surface p-4">
			<h2 class="mb-3 text-sm font-semibold">Randevulardaki roller</h2>
			{#if apptQuery.isPending}
				<p class="text-sm text-text-muted">Yükleniyor…</p>
			{:else if relatedAppointments.length === 0}
				<p class="text-sm text-text-muted">Klinik / otel / transfer olarak geçmiyor.</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each relatedAppointments as a (a.id)}
						<li class="py-2.5">
							<p class="text-sm font-medium">{a.patient_display_name}</p>
							<p class="text-xs text-text-faint">
								{formatDate(a.starts_at)} · {formatTime(a.starts_at)}
								·
								{#if a.clinic_contact_id === id}Klinik{/if}
								{#if a.hotel_contact_id === id}Otel{/if}
								{#if a.transfer_contact_id === id}Transfer{/if}
							</p>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<ContactFormDialog
			bind:open={formOpen}
			{contact}
			{saving}
			error={formError}
			onsubmit={saveContact}
		/>
	{/if}
</div>

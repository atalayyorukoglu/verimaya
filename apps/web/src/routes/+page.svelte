<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { Appointment, Conversation, Patient, Tenant } from '@verimaya/shared';
	import { patientStatusLabels } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { formatDateTime, formatTime, isSameLocalDay } from '$lib/format';
	import { patientStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type Page<T> = { items: T[]; next_cursor: string | null };

	const tenantQuery = createQuery(() => ({
		queryKey: ['tenants', 'current'],
		queryFn: () => apiGet<Tenant>('/v1/tenants/current')
	}));

	const patientsQuery = createQuery(() => ({
		queryKey: ['patients', { limit: 5 }],
		queryFn: () => apiGet<Page<Patient>>(listUrl('patients', { limit: 5 }))
	}));

	const appointmentsQuery = createQuery(() => ({
		queryKey: ['appointments', { limit: 40 }],
		queryFn: () => apiGet<Page<Appointment>>(listUrl('appointments', { limit: 40 }))
	}));

	const conversationsQuery = createQuery(() => ({
		queryKey: ['conversations', { limit: 5 }],
		queryFn: () => apiGet<Page<Conversation>>(listUrl('conversations', { limit: 5 }))
	}));

	const todayAppointments = $derived(
		(appointmentsQuery.data?.items ?? []).filter((a) => isSameLocalDay(a.starts_at)).slice(0, 5)
	);

	const recentPatients = $derived(patientsQuery.data?.items ?? []);
	const recentMessages = $derived(conversationsQuery.data?.items ?? []);
</script>

<svelte:head>
	<title>Panel · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<PageHeader
		title="Kaldığın yerden devam et"
		description={tenantQuery.data
			? `${tenantQuery.data.name} — bugünkü operasyona hızlı bakış`
			: 'Bugünkü operasyona hızlı bakış'}
	/>

	<div class="mb-8 grid min-w-0 gap-4 lg:grid-cols-3">
		<section class="min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-text">Son hastalar</h2>
				<a href="/hastalar" class="text-xs text-info hover:underline">Tümü</a>
			</div>
			{#if patientsQuery.isPending}
				<p class="text-sm text-text-faint">Yükleniyor…</p>
			{:else if recentPatients.length === 0}
				<p class="text-sm text-text-faint">Henüz hasta yok.</p>
			{:else}
				<ul class="min-w-0 divide-y divide-border">
					{#each recentPatients as patient (patient.id)}
						<li class="min-w-0">
							<a
								href={`/hastalar/${patient.id}`}
								class="flex min-w-0 items-center gap-2 rounded-[6px] px-1 py-2.5 transition-colors hover:bg-surface-2 sm:gap-3 sm:px-2"
							>
								<div class="min-w-0 flex-1 overflow-hidden">
									<p class="truncate text-sm font-medium text-text">{patient.full_name}</p>
									<p class="truncate text-xs text-text-faint">
										{patient.source ?? 'Kaynak yok'} · {formatDateTime(patient.updated_at)}
									</p>
								</div>
								<StatusBadge
									label={patientStatusLabels[patient.status]}
									tone={patientStatusTone(patient.status)}
								/>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-text">Bugünün randevuları</h2>
				<a href="/randevular" class="text-xs text-info hover:underline">Tümü</a>
			</div>
			{#if appointmentsQuery.isPending}
				<p class="text-sm text-text-faint">Yükleniyor…</p>
			{:else if todayAppointments.length === 0}
				<p class="text-sm text-text-faint">Bugün randevu yok.</p>
			{:else}
				<ul class="min-w-0 divide-y divide-border">
					{#each todayAppointments as appt (appt.id)}
						<li class="flex min-w-0 items-start gap-2 py-2.5 sm:gap-3">
							<span
								class="w-10 shrink-0 pt-0.5 text-sm font-medium text-brand tabular-nums sm:w-12"
							>
								{formatTime(appt.starts_at)}
							</span>
							<div class="min-w-0 flex-1 overflow-hidden">
								<p class="truncate text-sm font-medium text-text">{appt.patient_display_name}</p>
								<p class="truncate text-xs text-text-faint">
									{appt.title ?? appt.appointment_type ?? 'Randevu'}
								</p>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-text">Son mesajlar</h2>
				<a href="/inbox" class="text-xs text-info hover:underline">Inbox</a>
			</div>
			{#if conversationsQuery.isPending}
				<p class="text-sm text-text-faint">Yükleniyor…</p>
			{:else if recentMessages.length === 0}
				<p class="text-sm text-text-faint">Henüz mesaj yok.</p>
			{:else}
				<ul class="min-w-0 divide-y divide-border">
					{#each recentMessages as conv (conv.id)}
						<li class="min-w-0">
							<a
								href="/inbox"
								class="block min-w-0 rounded-[6px] px-1 py-2.5 transition-colors hover:bg-surface-2 sm:px-2"
							>
								<div class="flex min-w-0 items-center gap-2">
									<p class="min-w-0 flex-1 truncate text-sm font-medium text-text">
										{conv.contact_name ?? conv.patient_display_name ?? 'Bilinmeyen'}
									</p>
									{#if conv.unread_count > 0}
										<span
											class="shrink-0 rounded-full bg-brand px-1.5 text-[10px] font-semibold text-primary-foreground"
										>
											{conv.unread_count}
										</span>
									{/if}
								</div>
								<p class="mt-0.5 truncate text-xs text-text-faint">
									{conv.last_message_preview}
								</p>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<section>
		<h2 class="mb-3 text-sm font-semibold text-text">Özet metrikler</h2>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each [{ label: 'Yeni lead', value: String(recentPatients.filter((p) => p.status === 'lead').length), hint: 'Son sayfada' }, { label: 'Bugün randevu', value: String(todayAppointments.length), hint: 'Bugün' }, { label: 'Okunmamış', value: String(recentMessages.reduce((s, c) => s + c.unread_count, 0)), hint: 'Inbox' }, { label: 'Aktif tenant', value: tenantQuery.data?.base_currency ?? '—', hint: 'Para birimi' }] as card (card.label)}
				<div class="rounded-lg border border-border bg-surface p-4">
					<p class="text-xs text-text-muted">{card.label}</p>
					<p class="mt-1 text-2xl font-semibold tracking-tight text-text">{card.value}</p>
					<p class="mt-1 text-xs text-text-faint">{card.hint}</p>
				</div>
			{/each}
		</div>
	</section>
</div>

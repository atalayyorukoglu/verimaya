<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { Appointment, InboundMessage, Patient, Tenant } from '@verimaya/shared';
	import { patientStatusLabels } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { formatDateTime, formatTime, isSameLocalDay } from '$lib/format';
	import { patientStatusTone } from '$lib/status-tone';
	import { canAccessPath, getDemoRole } from '$lib/rbac';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type Page<T> = { items: T[]; next_cursor: string | null };

	const role = getDemoRole();
	const canFinance = canAccessPath('/finans/aktar', role);

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

	const inboxQuery = createQuery(() => ({
		queryKey: ['whatsapp', 'inbox'],
		queryFn: () => apiGet<{ messages: InboundMessage[] }>('/v1/whatsapp/inbox'),
		enabled: canFinance
	}));

	const todayAppointments = $derived(
		(appointmentsQuery.data?.items ?? []).filter((a) => isSameLocalDay(a.starts_at)).slice(0, 5)
	);

	const recentPatients = $derived(patientsQuery.data?.items ?? []);
	const pendingMessages = $derived(
		(inboxQuery.data?.messages ?? []).filter((m) => m.status === 'new').slice(0, 5)
	);
	const pendingCount = $derived(
		(inboxQuery.data?.messages ?? []).filter((m) => m.status === 'new').length
	);

	const anyError = $derived(
		patientsQuery.isError || appointmentsQuery.isError || (canFinance && inboxQuery.isError)
	);
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

	{#if anyError}
		<div class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
			Bazı paneller yüklenemedi. Sayfayı yenileyin veya MSW senaryosunu kontrol edin.
		</div>
	{/if}

	<div class="mb-8 grid min-w-0 gap-4 lg:grid-cols-3">
		<section class="min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-text">Son hastalar</h2>
				<a href="/hastalar" class="text-xs text-info hover:underline">Tümü</a>
			</div>
			{#if patientsQuery.isPending}
				<p class="text-sm text-text-faint">Yükleniyor…</p>
			{:else if patientsQuery.isError}
				<p class="text-sm text-danger">Hastalar yüklenemedi.</p>
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
			{:else if appointmentsQuery.isError}
				<p class="text-sm text-danger">Randevular yüklenemedi.</p>
			{:else if todayAppointments.length === 0}
				<p class="text-sm text-text-faint">Bugün randevu yok.</p>
			{:else}
				<ul class="min-w-0 divide-y divide-border">
					{#each todayAppointments as appt (appt.id)}
						<li class="min-w-0">
							<a
								href={appt.patient_id ? `/hastalar/${appt.patient_id}` : '/randevular'}
								class="flex min-w-0 items-start gap-2 rounded-[6px] px-1 py-2.5 transition-colors hover:bg-surface-2 sm:gap-3 sm:px-2"
							>
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
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-text">Bekleyen WhatsApp</h2>
				{#if canFinance}
					<a href="/finans/aktar" class="text-xs text-info hover:underline">
						{pendingCount > 0 ? `${pendingCount} yeni` : 'AI ile işlem'}
					</a>
				{:else}
					<span class="text-xs text-text-faint">Finans yetkisi gerekli</span>
				{/if}
			</div>
			{#if !canFinance}
				<p class="text-sm text-text-faint">
					Bu rol WhatsApp işlem aktarımını göremez. Rolü toolbar’dan değiştirin.
				</p>
			{:else if inboxQuery.isPending}
				<p class="text-sm text-text-faint">Yükleniyor…</p>
			{:else if inboxQuery.isError}
				<p class="text-sm text-danger">Mesajlar yüklenemedi.</p>
			{:else if pendingMessages.length === 0}
				<p class="text-sm text-text-faint">Bekleyen mesaj yok.</p>
			{:else}
				<ul class="min-w-0 divide-y divide-border">
					{#each pendingMessages as msg (msg.id)}
						<li class="min-w-0">
							<a
								href={`/finans/aktar?inbox=${msg.id}`}
								class="block min-w-0 rounded-[6px] px-1 py-2.5 transition-colors hover:bg-surface-2 sm:px-2"
							>
								<p class="truncate text-sm font-medium text-text">
									{msg.body?.trim() || (msg.has_media ? '(medya)' : 'Mesaj')}
								</p>
								<p class="mt-0.5 truncate text-xs text-text-faint">
									{formatDateTime(msg.created_at)}
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
			{#each [{ label: 'Yeni lead', value: String(recentPatients.filter((p) => p.status === 'lead').length), hint: 'Son sayfada' }, { label: 'Bugün randevu', value: String(todayAppointments.length), hint: 'Bugün' }, { label: 'WA bekleyen', value: canFinance ? String(pendingCount) : '—', hint: canFinance ? 'AI ile işlem' : 'Yetki yok' }, { label: 'Para birimi', value: tenantQuery.data?.base_currency ?? '—', hint: tenantQuery.data?.name ?? 'Organizasyon' }] as card (card.label)}
				<div class="rounded-lg border border-border bg-surface p-4">
					<p class="text-xs text-text-muted">{card.label}</p>
					<p class="mt-1 text-2xl font-semibold tracking-tight text-text">{card.value}</p>
					<p class="mt-1 text-xs text-text-faint">{card.hint}</p>
				</div>
			{/each}
		</div>
	</section>
</div>

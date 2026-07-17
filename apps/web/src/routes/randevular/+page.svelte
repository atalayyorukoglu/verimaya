<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { Appointment } from '@verimaya/shared';
	import { appointmentStatusLabels } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { formatDateTime, formatTime, isSameLocalDay } from '$lib/format';
	import { appointmentStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type Page = { items: Appointment[]; next_cursor: string | null };

	const appointmentsQuery = createQuery(() => ({
		queryKey: ['appointments', { limit: 100 }],
		queryFn: () => apiGet<Page>(listUrl('appointments', { limit: 100 }))
	}));

	const today = $derived(
		(appointmentsQuery.data?.items ?? []).filter((a) => isSameLocalDay(a.starts_at))
	);
	const upcoming = $derived(
		(appointmentsQuery.data?.items ?? []).filter((a) => !isSameLocalDay(a.starts_at)).slice(0, 30)
	);
</script>

<svelte:head>
	<title>Randevular · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-6xl">
	<PageHeader
		title="Randevular"
		description="Takvim görünümü sonraki iterasyonda; şimdilik gün + liste."
	/>

	{#if appointmentsQuery.isPending}
		<p class="text-text-muted text-sm">Yükleniyor…</p>
	{:else if appointmentsQuery.isError}
		<p class="text-danger text-sm">Randevular yüklenemedi.</p>
	{:else if (appointmentsQuery.data?.items.length ?? 0) === 0}
		<div class="border-border bg-surface rounded-lg border p-8 text-center">
			<p class="text-text-muted text-sm">Randevu yok.</p>
		</div>
	{:else}
		<section class="mb-8">
			<h2 class="text-text mb-3 text-sm font-semibold">Bugün</h2>
			{#if today.length === 0}
				<p class="text-text-faint text-sm">Bugün randevu yok.</p>
			{:else}
				<ul class="space-y-2">
					{#each today as appt (appt.id)}
						<li class="border-border bg-surface flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
							<div class="flex min-w-0 items-start gap-3">
								<span class="text-brand w-14 shrink-0 text-sm font-semibold tabular-nums">
									{formatTime(appt.starts_at)}
								</span>
								<div class="min-w-0">
									<p class="text-text truncate text-sm font-medium">{appt.patient_display_name}</p>
									<p class="text-text-muted truncate text-xs">
										{appt.title ?? appt.appointment_type ?? 'Randevu'}
										{#if appt.clinic_name}
											· {appt.clinic_name}
										{/if}
									</p>
								</div>
							</div>
							<StatusBadge
								label={appointmentStatusLabels[appt.status]}
								tone={appointmentStatusTone(appt.status)}
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section>
			<h2 class="text-text mb-3 text-sm font-semibold">Yaklaşan</h2>
			<ul class="border-border bg-surface divide-border divide-y overflow-hidden rounded-lg border">
				{#each upcoming as appt (appt.id)}
					<li class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
						<div class="min-w-0">
							<p class="text-text truncate text-sm font-medium">{appt.patient_display_name}</p>
							<p class="text-text-faint text-xs">{formatDateTime(appt.starts_at)}</p>
						</div>
						<StatusBadge
							label={appointmentStatusLabels[appt.status]}
							tone={appointmentStatusTone(appt.status)}
						/>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

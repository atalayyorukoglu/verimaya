<script lang="ts">
	import type { Appointment } from '@verimaya/shared';
	import { appointmentStatusLabels } from '@verimaya/shared';
	import { formatDate, formatTime } from '$lib/format';
	import { appointmentStatusTone } from '$lib/status-tone';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import PatientCaseNotesThread from '$lib/components/PatientCaseNotesThread.svelte';
	import { Button } from '$lib/components/ui/button';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';

	let {
		appointments = [],
		onedit
	}: {
		appointments?: Appointment[];
		onedit: (appt: Appointment) => void;
	} = $props();

	let expanded = $state<Record<string, boolean>>({});

	function toggle(id: string) {
		expanded = { ...expanded, [id]: !expanded[id] };
	}

	const sorted = $derived(
		[...appointments].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
	);
</script>

{#if sorted.length === 0}
	<div class="rounded-lg border border-border bg-surface p-6 text-center">
		<p class="text-sm text-text-muted">Bu aralıkta randevu yok.</p>
	</div>
{:else}
	<ul class="grid min-w-0 gap-3 lg:grid-cols-2">
		{#each sorted as appt (appt.id)}
			{@const open = !!expanded[appt.id]}
			<li class="min-w-0 overflow-hidden rounded-lg border border-border bg-surface">
				<header class="border-b border-border bg-brand-subtle/50 px-3 py-2.5 sm:px-4">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div class="min-w-0">
							<p class="text-xs font-medium text-brand tabular-nums">
								{formatDate(appt.starts_at)} · {formatTime(appt.starts_at)}
								{#if appt.ends_at}
									– {formatTime(appt.ends_at)}
								{/if}
							</p>
							<a
								href={`/patients/${appt.patient_id}`}
								class="mt-0.5 block truncate text-sm font-semibold text-text hover:text-brand hover:underline"
							>
								{appt.patient_display_name}
							</a>
							<p class="truncate text-xs text-text-faint">
								{appt.title ?? appt.appointment_type ?? 'Randevu'}
							</p>
						</div>
						<StatusBadge
							label={appointmentStatusLabels[appt.status]}
							tone={appointmentStatusTone(appt.status)}
						/>
					</div>
				</header>

				<div class="space-y-3 px-3 py-3 sm:px-4">
					<p class="text-[11px] font-semibold tracking-wider text-text-faint uppercase">
						Hasta notları
					</p>
					<PatientCaseNotesThread patientId={appt.patient_id} variant="card" />

					{#if open}
						<dl class="grid gap-2 rounded-[6px] border border-border bg-surface-2/30 px-3 py-2.5 text-sm">
							<div class="grid gap-0.5 sm:grid-cols-[7rem_1fr]">
								<dt class="text-xs text-text-muted">Klinik</dt>
								<dd class="text-text">{appt.clinic_name ?? '—'}</dd>
							</div>
							<div class="grid gap-0.5 sm:grid-cols-[7rem_1fr]">
								<dt class="text-xs text-text-muted">Otel</dt>
								<dd class="text-text">{appt.hotel_name ?? '—'}</dd>
							</div>
							<div class="grid gap-0.5 sm:grid-cols-[7rem_1fr]">
								<dt class="text-xs text-text-muted">Transfer</dt>
								<dd class="break-words whitespace-pre-wrap text-text">
									{appt.transfer_note ?? '—'}
								</dd>
							</div>
							<div class="grid gap-0.5 sm:grid-cols-[7rem_1fr]">
								<dt class="text-xs text-text-muted">Randevu notu</dt>
								<dd class="break-words whitespace-pre-wrap text-text">{appt.notes ?? '—'}</dd>
							</div>
						</dl>
					{/if}

					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							class="inline-flex h-9 items-center gap-1 rounded-[6px] px-2 text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text sm:h-7"
							onclick={() => toggle(appt.id)}
						>
							{#if open}
								<ChevronUp class="size-3.5" />
								Detayı gizle
							{:else}
								<ChevronDown class="size-3.5" />
								Detay
							{/if}
						</button>
						<Button type="button" size="sm" variant="secondary" onclick={() => onedit(appt)}>
							Düzenle
						</Button>
					</div>
				</div>
			</li>
		{/each}
	</ul>
{/if}

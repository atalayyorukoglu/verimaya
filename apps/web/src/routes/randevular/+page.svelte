<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		Appointment,
		AppointmentCreate,
		AppointmentUpdate,
		Patient
	} from '@verimaya/shared';
	import { appointmentStatusLabels } from '@verimaya/shared';
	import { apiGet, apiSend, listUrl } from '$lib/api';
	import { formatDate, formatTime } from '$lib/format';
	import { appointmentStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import AppointmentFormDialog from '$lib/components/AppointmentFormDialog.svelte';
	import AppointmentOpsList from '$lib/components/AppointmentOpsList.svelte';
	import { Button } from '$lib/components/ui/button';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import X from '@lucide/svelte/icons/x';

	type Page = { items: Appointment[]; next_cursor: string | null };
	type PatientsPage = { items: Patient[]; next_cursor: string | null };
	type ViewMode = 'day' | 'week';

	const queryClient = useQueryClient();

	const patientFilterId = $derived(page.url.searchParams.get('hasta'));

	let view = $state<ViewMode>('week');
	let anchor = $state(startOfDay(new Date()));
	let formOpen = $state(false);
	let editing = $state<Appointment | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	function startOfDay(d: Date) {
		const x = new Date(d);
		x.setHours(0, 0, 0, 0);
		return x;
	}

	function addDays(d: Date, n: number) {
		const x = new Date(d);
		x.setDate(x.getDate() + n);
		return x;
	}

	function startOfWeek(d: Date) {
		const x = startOfDay(d);
		const day = x.getDay();
		const diff = day === 0 ? -6 : 1 - day; // Monday start
		return addDays(x, diff);
	}

	const rangeStart = $derived(view === 'day' ? startOfDay(anchor) : startOfWeek(anchor));
	const rangeEnd = $derived(view === 'day' ? addDays(rangeStart, 1) : addDays(rangeStart, 7));

	const days = $derived(
		view === 'day' ? [rangeStart] : Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i))
	);

	const appointmentsQuery = createQuery(() => ({
		queryKey: [
			'appointments',
			{
				from: rangeStart.toISOString(),
				to: rangeEnd.toISOString(),
				patient_id: patientFilterId
			}
		],
		queryFn: () =>
			apiGet<Page>(
				listUrl('appointments', {
					limit: 100,
					from: rangeStart.toISOString(),
					to: rangeEnd.toISOString(),
					patient_id: patientFilterId
				})
			)
	}));

	const patientsQuery = createQuery(() => ({
		queryKey: ['patients', { limit: 100, for: 'picker' }],
		queryFn: () => apiGet<PatientsPage>(listUrl('patients', { limit: 100 }))
	}));

	const filterPatient = $derived(
		patientFilterId
			? (patientsQuery.data?.items ?? []).find((p) => p.id === patientFilterId)
			: null
	);

	const byDay = $derived.by(() => {
		const map = new Map<string, Appointment[]>();
		for (const day of days) {
			map.set(day.toISOString().slice(0, 10), []);
		}
		for (const appt of appointmentsQuery.data?.items ?? []) {
			const key = new Date(appt.starts_at).toISOString().slice(0, 10);
			const list = map.get(key);
			if (list) list.push(appt);
		}
		for (const list of map.values()) {
			list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
		}
		return map;
	});

	const rangeLabel = $derived(
		view === 'day'
			? formatDate(rangeStart.toISOString())
			: `${formatDate(rangeStart.toISOString())} – ${formatDate(addDays(rangeStart, 6).toISOString())}`
	);

	const rangeAppointments = $derived(
		[...(appointmentsQuery.data?.items ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
	);

	function openCreate() {
		editing = null;
		formOpen = true;
	}

	function openEdit(appt: Appointment) {
		editing = appt;
		formOpen = true;
	}

	async function saveAppointment(data: AppointmentCreate | AppointmentUpdate) {
		saving = true;
		formError = null;
		try {
			if (editing) {
				await apiSend(`/v1/appointments/${editing.id}`, 'PATCH', data);
			} else {
				await apiSend('/v1/appointments', 'POST', data);
			}
			await queryClient.invalidateQueries({ queryKey: ['appointments'] });
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Kayıt başarısız';
		} finally {
			saving = false;
		}
	}

	function shift(dir: -1 | 1) {
		anchor = addDays(anchor, view === 'day' ? dir : dir * 7);
	}

	function clearPatientFilter() {
		void goto('/randevular');
	}
</script>

<svelte:head>
	<title>Randevular · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<PageHeader title="Randevular" description="Gün ve hafta takvim görünümü.">
		{#snippet actions()}
			<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
				<div class="flex rounded-[6px] border border-border bg-surface p-0.5">
					<button
						type="button"
						class="rounded-[4px] px-2.5 py-1 text-xs font-medium {view === 'day'
							? 'bg-brand-subtle text-brand'
							: 'text-text-muted'}"
						onclick={() => (view = 'day')}
					>
						Gün
					</button>
					<button
						type="button"
						class="rounded-[4px] px-2.5 py-1 text-xs font-medium {view === 'week'
							? 'bg-brand-subtle text-brand'
							: 'text-text-muted'}"
						onclick={() => (view = 'week')}
					>
						Hafta
					</button>
				</div>
				<div class="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						type="button"
						aria-label="Önceki"
						onclick={() => shift(-1)}
					>
						<ChevronLeft class="size-4" />
					</Button>
					<span class="min-w-0 text-sm font-medium text-text">{rangeLabel}</span>
					<Button
						variant="ghost"
						size="icon"
						type="button"
						aria-label="Sonraki"
						onclick={() => shift(1)}
					>
						<ChevronRight class="size-4" />
					</Button>
					<Button
						variant="secondary"
						type="button"
						onclick={() => {
							anchor = startOfDay(new Date());
						}}
					>
						Bugün
					</Button>
				</div>
				<Button type="button" onclick={openCreate}>Yeni randevu</Button>
			</div>
		{/snippet}
	</PageHeader>

	{#if patientFilterId}
		<div
			class="mb-4 flex flex-wrap items-center gap-2 rounded-[6px] border border-border bg-surface-2/50 px-3 py-2 text-sm"
		>
			<span class="text-text-muted">Hasta filtresi:</span>
			<span class="font-medium text-text">
				{filterPatient?.full_name ?? 'Yükleniyor…'}
			</span>
			<button
				type="button"
				class="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-xs text-text-muted hover:bg-surface hover:text-text"
				onclick={clearPatientFilter}
			>
				<X class="size-3.5" />
				Temizle
			</button>
		</div>
	{/if}

	{#if appointmentsQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if appointmentsQuery.isError}
		<p class="text-sm text-danger">Randevular yüklenemedi.</p>
	{:else}
		<div class="grid min-w-0 gap-3 {view === 'week' ? 'md:grid-cols-7' : 'grid-cols-1'}">
			{#each days as day (day.toISOString())}
				{@const key = day.toISOString().slice(0, 10)}
				{@const items = byDay.get(key) ?? []}
				{@const isToday = key === new Date().toISOString().slice(0, 10)}
				<section
					class="min-w-0 overflow-hidden rounded-lg border border-border bg-surface {isToday
						? 'ring-1 ring-brand/40'
						: ''}"
				>
					<header class="border-b border-border bg-surface-2/40 px-3 py-2">
						<p class="text-[11px] font-semibold tracking-wider text-text-muted uppercase">
							{day.toLocaleDateString('tr-TR', { weekday: 'short' })}
						</p>
						<p class="text-sm font-semibold text-text">{day.getDate()}</p>
					</header>
					<ul class="min-h-24 space-y-1.5 p-2">
						{#if items.length === 0}
							<li class="px-1 py-3 text-center text-xs text-text-faint">Boş</li>
						{:else}
							{#each items as appt (appt.id)}
								<li>
									<button
										type="button"
										class="w-full min-w-0 rounded-[6px] border border-transparent px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
										onclick={() => openEdit(appt)}
									>
										<p class="text-xs font-medium text-brand tabular-nums">
											{formatTime(appt.starts_at)}
										</p>
										<p class="truncate text-xs font-medium text-text">
											{appt.patient_display_name}
										</p>
										<p class="truncate text-[11px] text-text-faint">
											{appt.title ?? appt.appointment_type ?? 'Randevu'}
										</p>
										<div class="mt-1">
											<StatusBadge
												label={appointmentStatusLabels[appt.status]}
												tone={appointmentStatusTone(appt.status)}
											/>
										</div>
									</button>
								</li>
							{/each}
						{/if}
					</ul>
				</section>
			{/each}
		</div>

		<section class="mt-8 min-w-0">
			<div class="mb-3">
				<h2 class="text-sm font-semibold text-text">Operasyon listesi</h2>
				<p class="mt-0.5 text-xs text-text-muted">
					Seçili aralıktaki randevular — hasta notları kart üzerinde (takvim değişmeden).
				</p>
			</div>
			<AppointmentOpsList appointments={rangeAppointments} onedit={openEdit} />
		</section>
	{/if}
</div>

<AppointmentFormDialog
	bind:open={formOpen}
	appointment={editing}
	patients={patientsQuery.data?.items ?? []}
	defaultPatientId={patientFilterId}
	{saving}
	error={formError}
	onsubmit={saveAppointment}
/>

<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		Appointment,
		AppointmentCreate,
		AppointmentStatus,
		AppointmentUpdate,
		ContractResponse,
		Tenant
	} from '@verimaya/shared';
	import {
		apiPaths,
		appointmentStatusLabels,
		appointmentStatusSchema,
		listUrl,
		toTenantDayKey
	} from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDate, formatTime } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import { appointmentStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PeriodSelector from '$lib/components/PeriodSelector.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import AppointmentFormDialog from '$lib/components/AppointmentFormDialog.svelte';
	import AppointmentOpsList from '$lib/components/AppointmentOpsList.svelte';
	import Combobox from '$lib/components/Combobox.svelte';
	import {
		dayKeyToDate,
		monthRangeInTz,
		resolvePeriodRange,
		type PeriodKey
	} from '$lib/period-range';
	import { Button } from '$lib/components/ui/button';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import X from '@lucide/svelte/icons/x';

	type AppointmentsPage = ContractResponse<'GET /v1/appointments'>;
	type ContactsPage = ContractResponse<'GET /v1/contacts'>;
	type ViewMode = 'day' | 'week';

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const contactFilterId = $derived(page.url.searchParams.get('contact'));

	let view = $state<ViewMode>('week');
	let anchor = $state(startOfDay(new Date()));
	let formOpen = $state(false);
	let editing = $state<Appointment | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	let qInput = $state('');
	let appliedQ = $state('');
	let status = $state('');
	let contactInvolvesId = $state(page.url.searchParams.get('contact_involves') ?? '');
	let periodKey = $state<PeriodKey>('bu-ay');
	let customFrom = $state('');
	let customTo = $state('');

	const statusOptions = $derived(appointmentStatusSchema.options);

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

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>('/v1/tenants/current'),
		enabled: qs.ready
	}));

	const tenantTimezone = $derived(tenantQuery.data?.timezone ?? 'Europe/Istanbul');

	const periodRange = $derived(resolvePeriodRange(periodKey, customFrom, customTo, tenantTimezone));

	const listFilters = $derived({
		from: periodRange.from ?? undefined,
		to: periodRange.to ?? undefined,
		contact_id: contactFilterId,
		contact_involves: contactInvolvesId || undefined,
		q: appliedQ || undefined,
		status: (status || undefined) as AppointmentStatus | undefined
	});

	const days = $derived(
		view === 'day' ? [rangeStart] : Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i))
	);

	const appointmentsQuery = createQuery(() => ({
		queryKey: qs.keys.appointments.list({
			from: listFilters.from,
			to: listFilters.to,
			contact_id: listFilters.contact_id,
			contact_involves: listFilters.contact_involves,
			q: listFilters.q,
			status: listFilters.status
		}),
		queryFn: () =>
			apiGet<AppointmentsPage>(
				listUrl('appointments', {
					limit: 100,
					from: listFilters.from,
					to: listFilters.to,
					contact_id: listFilters.contact_id,
					contact_involves: listFilters.contact_involves,
					q: listFilters.q,
					status: listFilters.status
				})
			),
		enabled: qs.ready && !!tenantQuery.data
	}));

	const contactsQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.list({ limit: 100, for: 'picker' }),
		queryFn: () => apiGet<ContactsPage>(listUrl('contacts', { limit: 100 })),
		enabled: qs.ready
	}));

	const contactOptions = $derived(
		(contactsQuery.data?.items ?? []).map((c) => ({
			value: c.id,
			label: c.display_name,
			description: c.contact_type_name
		}))
	);

	const filterContact = $derived(
		contactFilterId ? (contactsQuery.data?.items ?? []).find((c) => c.id === contactFilterId) : null
	);

	const filterInputClass =
		'border-border bg-surface text-text placeholder:text-text-faint box-border h-11 min-h-11 w-full min-w-0 max-w-full rounded-[6px] border px-3 text-base outline-none focus:ring-2 focus:ring-brand/40';

	const byDay = $derived.by(() => {
		const map = new Map<string, Appointment[]>();
		for (const day of days) {
			map.set(toTenantDayKey(day, tenantTimezone), []);
		}
		for (const appt of appointmentsQuery.data?.items ?? []) {
			const key = toTenantDayKey(new Date(appt.starts_at), tenantTimezone);
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
		[...(appointmentsQuery.data?.items ?? [])].sort((a, b) =>
			a.starts_at.localeCompare(b.starts_at)
		)
	);

	const statusCountEntries = $derived.by(() => {
		const counts = appointmentsQuery.data?.status_counts;
		if (!counts) return [] as { status: AppointmentStatus; count: number }[];
		return appointmentStatusSchema.options
			.filter((s) => (counts[s] ?? 0) > 0)
			.map((s) => ({ status: s, count: counts[s]! }));
	});

	function syncInvolvesUrl(id: string) {
		const url = new URL(page.url);
		if (id) {
			url.searchParams.set('contact_involves', id);
		} else {
			url.searchParams.delete('contact_involves');
		}
		const next = `${url.pathname}${url.search}`;
		const current = `${page.url.pathname}${page.url.search}`;
		if (next === current) return;
		void goto(next, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function applyFilters(e: Event) {
		e.preventDefault();
		appliedQ = qInput.trim();
		syncInvolvesUrl(contactInvolvesId);
	}

	function clearFilters() {
		qInput = '';
		appliedQ = '';
		status = '';
		contactInvolvesId = '';
		syncInvolvesUrl('');
	}

	function syncAnchorToPeriod() {
		if (periodKey === 'bu-ay') {
			anchor = startOfDay(new Date());
			return;
		}
		if (periodKey === 'gecen-ay') {
			const { from } = monthRangeInTz(-1, tenantTimezone);
			anchor = startOfDay(dayKeyToDate(from));
			return;
		}
		if (periodKey === 'ozel' && customFrom) {
			anchor = startOfDay(dayKeyToDate(customFrom));
		}
	}

	$effect(() => {
		void periodKey;
		if (periodKey === 'ozel') void customFrom;
		syncAnchorToPeriod();
	});

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
				await apiSend(apiPaths.appointment(editing.id), 'PATCH', data);
			} else {
				await apiSend(apiPaths.appointments, 'POST', data);
			}
			await queryClient.invalidateQueries({ queryKey: qs.keys.appointments.all() });
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('appointments.saveFailed');
		} finally {
			saving = false;
		}
	}

	async function deleteAppointment() {
		if (!editing) return;
		saving = true;
		formError = null;
		try {
			await apiSend(apiPaths.appointment(editing.id), 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.appointments.all() });
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('appointments.deleteFailed');
		} finally {
			saving = false;
		}
	}

	function shift(dir: -1 | 1) {
		const step = view === 'day' ? dir : dir * 7;
		let next = addDays(anchor, step);
		if (periodRange.from) {
			const min = startOfDay(dayKeyToDate(periodRange.from));
			if (next < min) next = min;
		}
		if (periodRange.to) {
			const max = startOfDay(dayKeyToDate(periodRange.to));
			if (next > max) next = max;
		}
		anchor = next;
	}

	function clearContactFilter() {
		void goto('/appointments');
	}
</script>

<svelte:head>
	<title>{t('appointments.title')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<PageHeader title={t('appointments.title')} description={t('appointments.description')}>
		{#snippet actions()}
			<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
				<div class="flex rounded-[6px] border border-border bg-surface p-0.5">
					<button
						type="button"
						class="rounded-[4px] px-2.5 py-1 text-xs font-medium {view === 'day'
							? 'bg-brand-subtle text-brand-text'
							: 'text-text-muted'}"
						onclick={() => (view = 'day')}
					>
						{t('appointments.view.day')}
					</button>
					<button
						type="button"
						class="rounded-[4px] px-2.5 py-1 text-xs font-medium {view === 'week'
							? 'bg-brand-subtle text-brand-text'
							: 'text-text-muted'}"
						onclick={() => (view = 'week')}
					>
						{t('appointments.view.week')}
					</button>
				</div>
				<div class="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						type="button"
						aria-label={t('appointments.prev')}
						onclick={() => shift(-1)}
					>
						<ChevronLeft class="size-4" />
					</Button>
					<span class="min-w-0 text-sm font-medium text-text">{rangeLabel}</span>
					<Button
						variant="ghost"
						size="icon"
						type="button"
						aria-label={t('appointments.next')}
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
						{t('appointments.today')}
					</Button>
				</div>
				<Button type="button" onclick={openCreate}>{t('appointments.new')}</Button>
			</div>
		{/snippet}
	</PageHeader>

	<PeriodSelector bind:periodKey bind:customFrom bind:customTo {tenantTimezone} />

	{#if contactFilterId}
		<div
			class="mb-4 flex flex-wrap items-center gap-2 rounded-[6px] border border-border bg-surface-2/50 px-3 py-2 text-sm"
		>
			<span class="text-text-muted">{t('appointments.filter.contact')}</span>
			<span class="font-medium text-text">
				{filterContact?.display_name ?? t('appointments.loading')}
			</span>
			<button
				type="button"
				class="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-xs text-text-muted hover:bg-surface hover:text-text"
				onclick={clearContactFilter}
			>
				<X class="size-3.5" />
				{t('appointments.filter.clearContact')}
			</button>
		</div>
	{/if}

	<form
		class="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-end"
		onsubmit={applyFilters}
	>
		<label class="grid min-w-0 flex-1 gap-1 lg:min-w-[14rem]">
			<span class="text-xs font-medium text-text-muted">{t('appointments.filter.involves')}</span>
			<Combobox
				id="appointments-contact-involves"
				bind:value={contactInvolvesId}
				options={contactOptions}
				placeholder={t('appointments.filter.involvesPlaceholder')}
				emptyText={t('appointments.filter.involvesEmpty')}
				clearLabel={t('appointments.filter.involvesClear')}
				inputClass={filterInputClass}
				onselect={(option) => syncInvolvesUrl(option?.value ?? '')}
			/>
		</label>
		<input
			class="{filterInputClass} flex-1 lg:min-w-[12rem]"
			placeholder={t('appointments.filter.qPlaceholder')}
			bind:value={qInput}
		/>
		<select class="{filterInputClass} lg:w-44" bind:value={status}>
			<option value="">{t('appointments.filter.statusAll')}</option>
			{#each statusOptions as s (s)}
				<option value={s}>{appointmentStatusLabels[s]}</option>
			{/each}
		</select>
		<div class="flex gap-2">
			<Button type="submit" variant="secondary" class="min-h-11"
				>{t('appointments.filter.apply')}</Button
			>
			{#if appliedQ || status || contactInvolvesId}
				<Button type="button" variant="outline" class="min-h-11" onclick={clearFilters}
					>{t('appointments.filter.clear')}</Button
				>
			{/if}
		</div>
	</form>

	{#if !appointmentsQuery.isPending && !appointmentsQuery.isError && statusCountEntries.length > 0}
		<p class="mb-4 text-sm text-text-muted" aria-label={t('appointments.stats.label')}>
			{#each statusCountEntries as entry, i (entry.status)}
				{#if i > 0}<span class="text-text-faint" aria-hidden="true"> · </span>{/if}
				<span>
					{t('appointments.stats.entry', {
						label: appointmentStatusLabels[entry.status],
						count: entry.count
					})}
				</span>
			{/each}
		</p>
	{/if}

	{#if appointmentsQuery.isPending}
		<p class="text-sm text-text-muted">{t('appointments.loading')}</p>
	{:else if appointmentsQuery.isError}
		<p class="text-sm text-danger">{t('appointments.loadError')}</p>
	{:else}
		<div class="grid min-w-0 gap-3 {view === 'week' ? 'md:grid-cols-7' : 'grid-cols-1'}">
			{#each days as day (day.toISOString())}
				{@const key = toTenantDayKey(day, tenantTimezone)}
				{@const items = byDay.get(key) ?? []}
				{@const isToday = key === toTenantDayKey(new Date(), tenantTimezone)}
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
							<li class="px-1 py-3 text-center text-xs text-text-faint">
								{t('appointments.emptyDay')}
							</li>
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
											{appt.contact_display_name}
										</p>
										{#if appt.contact_info_incomplete}
											<p class="mt-0.5">
												<StatusBadge
													label={t('appointments.contactInfoIncomplete')}
													tone="warning"
												/>
											</p>
										{/if}
										<p class="truncate text-[11px] text-text-faint">
											{appt.title ?? appt.appointment_type ?? t('appointments.fallbackTitle')}
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
				<h2 class="text-sm font-semibold text-text">{t('appointments.ops.heading')}</h2>
				<p class="mt-0.5 text-xs text-text-muted">
					{t('appointments.ops.description')}
				</p>
			</div>
			<AppointmentOpsList appointments={rangeAppointments} onedit={openEdit} />
		</section>
	{/if}
</div>

<AppointmentFormDialog
	bind:open={formOpen}
	appointment={editing}
	contacts={contactsQuery.data?.items ?? []}
	defaultContactId={contactFilterId}
	{saving}
	error={formError}
	onsubmit={saveAppointment}
	ondelete={editing ? deleteAppointment : undefined}
/>

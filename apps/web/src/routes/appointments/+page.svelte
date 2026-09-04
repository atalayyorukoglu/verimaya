<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { createInfiniteQuery, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		Appointment,
		AppointmentCreate,
		AppointmentStatus,
		AppointmentTypeSetting,
		AppointmentUpdate,
		ContractResponse,
		Tenant
	} from '@verimaya/shared';
	import {
		apiPaths,
		appointmentStatusLabels,
		appointmentStatusSchema,
		listUrl
	} from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDate, formatTime, initialsOf } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import AppointmentFormDialog from '$lib/components/AppointmentFormDialog.svelte';
	import {
		monthRangeInTz,
		resolvePeriodRange,
		type PeriodKey
	} from '$lib/period-range';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import X from '@lucide/svelte/icons/x';

	type AppointmentsPage = ContractResponse<'GET /v1/appointments'>;
	type ContactsPage = ContractResponse<'GET /v1/contacts'>;

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const contactFilterId = $derived(page.url.searchParams.get('contact'));

	let formOpen = $state(false);
	let editing = $state<Appointment | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	let status = $state('');
	let appointmentType = $state('');
	let periodKey = $state<PeriodKey>('bu-ay');
	let customFrom = $state('');
	let customTo = $state('');
	let customRangeHydrated = $state(false);

	const statusOptions = $derived(appointmentStatusSchema.options);

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>('/v1/tenants/current'),
		enabled: qs.ready
	}));

	const tenantTimezone = $derived(tenantQuery.data?.timezone ?? 'Europe/Istanbul');

	$effect(() => {
		if (customRangeHydrated || !tenantTimezone) return;
		if (!customFrom || !customTo) {
			const r = monthRangeInTz(0, tenantTimezone);
			customFrom = r.from;
			customTo = r.to;
		}
		customRangeHydrated = true;
	});

	const periodRange = $derived(resolvePeriodRange(periodKey, customFrom, customTo, tenantTimezone));

	const periodRangeText = $derived(
		periodRange.from && periodRange.to
			? `${periodRange.from} > ${periodRange.to}`
			: t('reports.period.allTime')
	);

	const periodOptions = $derived([
		{ key: 'bu-ay' as const, label: t('reports.period.thisMonth') },
		{ key: 'gecen-ay' as const, label: t('reports.period.lastMonth') },
		{ key: 'tum' as const, label: t('reports.period.allTime') },
		{ key: 'ozel' as const, label: t('reports.period.custom') }
	]);

	const typesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.appointmentTypes(),
		queryFn: () => apiGet<{ items: AppointmentTypeSetting[] }>(apiPaths.settingsAppointmentTypes),
		enabled: qs.ready
	}));

	const typeNames = $derived(
		[...(typesQuery.data?.items ?? [])]
			.sort((a, b) => a.sort_order - b.sort_order)
			.map((row) => row.name)
	);

	const PAGE_SIZE = 30;

	const appointmentsQuery = createInfiniteQuery(() => ({
		queryKey: qs.keys.appointments.list({
			from: periodRange.from ?? undefined,
			to: periodRange.to ?? undefined,
			contact_id: contactFilterId,
			status: (status || undefined) as AppointmentStatus | undefined,
			appointment_type: appointmentType || undefined,
			limit: PAGE_SIZE
		}),
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<AppointmentsPage>(
				listUrl('appointments', {
					limit: PAGE_SIZE,
					cursor: pageParam,
					from: periodRange.from ?? undefined,
					to: periodRange.to ?? undefined,
					contact_id: contactFilterId ?? undefined,
					status: (status || undefined) as AppointmentStatus | undefined,
					appointment_type: appointmentType || undefined
				})
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last: AppointmentsPage) => last.next_cursor,
		enabled: qs.ready && !!tenantQuery.data
	}));

	const contactsQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.list({ limit: 100, for: 'picker' }),
		queryFn: () => apiGet<ContactsPage>(listUrl('contacts', { limit: 100 })),
		enabled: qs.ready
	}));

	const contactById = $derived(
		new Map((contactsQuery.data?.items ?? []).map((c) => [c.id, c]))
	);

	const filterContact = $derived(
		contactFilterId ? contactById.get(contactFilterId) : null
	);

	const items = $derived(appointmentsQuery.data?.pages.flatMap((p) => p.items) ?? []);

	const selectedPeriodLabel = $derived(
		periodOptions.find((opt) => opt.key === periodKey)?.label ?? t('reports.period.label')
	);

	const filteredCount = $derived.by(() => {
		const counts = appointmentsQuery.data?.pages[0]?.status_counts;
		if (!counts) return items.length;
		return Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
	});

	const periodSummary = $derived(
		appointmentsQuery.isPending
			? selectedPeriodLabel
			: t('appointments.list.periodSummary', {
					period: selectedPeriodLabel,
					count: String(filteredCount)
				})
	);

	const fieldClass =
		'h-9 rounded-[8px] border border-border bg-surface px-3 text-sm font-medium text-text outline-none focus:ring-2 focus:ring-brand/40';

	function setPeriod(next: PeriodKey) {
		periodKey = next;
		if (next === 'ozel') {
			const r = monthRangeInTz(0, tenantTimezone);
			customFrom = r.from;
			customTo = r.to;
		}
	}

	function typeLabel(appt: Appointment): string {
		return appt.appointment_type?.trim() || appointmentStatusLabels[appt.status];
	}

	function typePillClass(appt: Appointment): string {
		const raw = appt.appointment_type?.trim() ?? '';
		if (/^rpt$/i.test(raw)) return 'border-danger/25 bg-danger/10 text-danger';
		if (/devam/i.test(raw)) return 'border-orange-200 bg-orange-50 text-orange-700';
		if (/yeni\s*hasta/i.test(raw)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
		if (raw) return 'border-border bg-surface-2 text-text-muted';
		switch (appt.status) {
			case 'completed':
				return 'border-emerald-200 bg-emerald-50 text-emerald-700';
			case 'cancelled':
			case 'no_show':
				return 'border-danger/25 bg-danger/10 text-danger';
			case 'confirmed':
			case 'in_progress':
				return 'border-brand/30 bg-brand-subtle text-brand-text';
			default:
				return 'border-border bg-surface-2 text-text-muted';
		}
	}

	function typeDotClass(appt: Appointment): string {
		const raw = appt.appointment_type?.trim() ?? '';
		if (/^rpt$/i.test(raw)) return 'bg-danger';
		if (/devam/i.test(raw)) return 'bg-orange-500';
		if (/yeni\s*hasta/i.test(raw)) return 'bg-emerald-600';
		if (raw) return 'bg-text-faint';
		switch (appt.status) {
			case 'completed':
				return 'bg-emerald-600';
			case 'cancelled':
			case 'no_show':
				return 'bg-danger';
			case 'confirmed':
			case 'in_progress':
				return 'bg-brand';
			default:
				return 'bg-text-faint';
		}
	}

	function scheduleLabel(appt: Appointment): string {
		const date = formatDate(appt.starts_at);
		const start = formatTime(appt.starts_at);
		if (appt.ends_at) {
			return `${date} · ${start} - ${formatTime(appt.ends_at)}`;
		}
		return `${date} · ${start}`;
	}

	function transferLabel(appt: Appointment): string {
		if (appt.transfer_contact_id) {
			const name = contactById.get(appt.transfer_contact_id)?.display_name;
			if (name) return name;
		}
		const note = appt.transfer_note?.trim();
		if (note) {
			const firstLine = note.split(/\n/)[0]?.trim();
			return firstLine || '—';
		}
		return '—';
	}

	function logisticsParts(appt: Appointment): { label: string; value: string }[] {
		return [
			{
				label: t('appointments.card.clinic'),
				value: appt.clinic_name?.trim() || '—'
			},
			{
				label: t('appointments.card.hotel'),
				value: appt.hotel_name?.trim() || '—'
			},
			{
				label: t('appointments.card.transfer'),
				value: transferLabel(appt)
			}
		];
	}

	function openCreate() {
		editing = null;
		formError = null;
		formOpen = true;
	}

	function openEdit(appt: Appointment) {
		editing = appt;
		formError = null;
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

	function clearContactFilter() {
		void goto(resolve('/appointments'));
	}
</script>

<svelte:head>
	<title>{t('appointments.documentTitle')}</title>
</svelte:head>

<div class="mx-auto w-full max-w-xl min-w-0">
	<header class="mb-4 border-b border-border pb-4">
		<h1 class="text-base font-semibold tracking-tight text-text sm:text-xl">
			{t('appointments.title')}
		</h1>
		<div class="mt-0.5 flex items-center justify-between gap-2 text-sm text-text-muted">
			<span class="min-w-0 truncate">{periodSummary}</span>
			<span class="shrink-0 text-right font-medium text-text-muted tabular-nums"
				>{periodRangeText}</span
			>
		</div>

		<div
			class="mt-3.5 flex gap-0.5 rounded-[8px] border border-border bg-surface-2 p-0.5"
			role="tablist"
			aria-label={t('reports.period.label')}
		>
			{#each periodOptions as opt (opt.key)}
				<button
					type="button"
					role="tab"
					aria-selected={periodKey === opt.key}
					class={cn(
						'min-w-0 flex-1 cursor-pointer rounded-[8px] px-1.5 py-2 text-center text-xs font-semibold transition-colors sm:px-2.5 sm:text-sm',
						periodKey === opt.key
							? 'border border-border bg-surface text-text shadow-xs'
							: 'text-text-faint hover:text-text-muted'
					)}
					onclick={() => setPeriod(opt.key)}
				>
					<span class="line-clamp-1">{opt.label}</span>
				</button>
			{/each}
		</div>

		{#if periodKey === 'ozel'}
			<div class="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
				<label class="grid gap-1 text-xs text-text-muted">
					{t('reports.period.from')}
					<input type="date" class={fieldClass} bind:value={customFrom} />
				</label>
				<label class="grid gap-1 text-xs text-text-muted">
					{t('reports.period.to')}
					<input type="date" class={fieldClass} bind:value={customTo} />
				</label>
			</div>
		{/if}

		<div class="mt-3.5 flex flex-nowrap items-center gap-2">
			<select
				class="{fieldClass} min-w-0 flex-1 px-2 text-xs sm:px-3 sm:text-sm"
				bind:value={appointmentType}
				aria-label={t('appointments.filter.typeAria')}
			>
				<option value="">{t('appointments.filter.typeAll')}</option>
				{#each typeNames as typeName (typeName)}
					<option value={typeName}>{typeName}</option>
				{/each}
			</select>
			<select
				class="{fieldClass} min-w-0 flex-1 px-2 text-xs sm:px-3 sm:text-sm"
				bind:value={status}
				aria-label={t('appointments.filter.statusAria')}
			>
				<option value="">{t('appointments.filter.statusAll')}</option>
				{#each statusOptions as s (s)}
					<option value={s}>{appointmentStatusLabels[s]}</option>
				{/each}
			</select>
			<Button
				type="button"
				class="shrink-0 px-2.5 sm:px-4"
				aria-label={t('appointments.new')}
				onclick={openCreate}
			>
				<Plus class="size-4" />
				<span class="hidden sm:inline">{t('appointments.new')}</span>
			</Button>
		</div>
	</header>

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

	{#if appointmentsQuery.isPending}
		<p class="text-sm text-text-muted">{t('appointments.loading')}</p>
	{:else if appointmentsQuery.isError}
		<p class="text-sm text-danger">{t('appointments.loadError')}</p>
	{:else if items.length === 0}
		<div class="rounded-xl border border-border bg-surface p-8 text-center">
			<p class="text-sm font-medium text-text">{t('appointments.emptyTitle')}</p>
			<p class="mt-1 text-sm text-text-muted">{t('appointments.emptyBody')}</p>
			<Button class="mt-4" type="button" onclick={openCreate}>
				<Plus class="size-4" />
				{t('appointments.new')}
			</Button>
		</div>
	{:else}
		<ul class="space-y-2">
			{#each items as appt (appt.id)}
				<li class="min-w-0">
					<div
						class="relative flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2/40"
					>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							class="absolute top-2 right-2 z-10 shrink-0"
							aria-label={t('common.edit')}
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								openEdit(appt);
							}}
						>
							<Pencil class="size-4" />
						</Button>
						<a
							href={resolve('/contacts/[id]', { id: appt.contact_id })}
							class="flex min-w-0 flex-col gap-3 pr-8 text-left text-inherit no-underline"
						>
							<div class="flex min-w-0 items-center gap-3">
								<span
									class="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-sm font-semibold text-text"
									aria-hidden="true"
								>
									{initialsOf(appt.contact_display_name)}
								</span>
								<div class="min-w-0 flex-1">
									<p class="truncate text-base font-semibold text-text">
										{appt.contact_display_name}
									</p>
									<div
										class={cn(
											'mt-1 inline-flex max-w-full items-center gap-1.5 rounded-[6px] border px-2 py-1',
											typePillClass(appt)
										)}
									>
										<span
											class={cn('size-2 shrink-0 rounded-full', typeDotClass(appt))}
											aria-hidden="true"
										></span>
										<span class="truncate text-xs font-semibold">{typeLabel(appt)}</span>
										<span class="shrink-0 text-xs opacity-90 tabular-nums"
											>{scheduleLabel(appt)}</span
										>
									</div>
								</div>
							</div>
							<p class="min-w-0 text-sm break-words text-text-muted">
								{#each logisticsParts(appt) as part, i (part.label)}
									{#if i > 0}<span aria-hidden="true">, </span>{/if}
									<span class="font-medium text-text">{part.label}:</span>
									<span> {part.value}</span>
								{/each}
							</p>
						</a>
					</div>
				</li>
			{/each}
		</ul>

		{#if appointmentsQuery.hasNextPage}
			<div class="mt-4 flex justify-center">
				<Button
					variant="outline"
					type="button"
					disabled={appointmentsQuery.isFetchingNextPage}
					onclick={() => appointmentsQuery.fetchNextPage()}
				>
					{appointmentsQuery.isFetchingNextPage
						? t('common.loading')
						: t('appointments.list.loadMore')}
				</Button>
			</div>
		{/if}
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

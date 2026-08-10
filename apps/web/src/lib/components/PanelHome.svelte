<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type {
		Appointment,
		Contact,
		InboundMessage,
		ReportContactDistribution,
		ReportSummary,
		Tenant
	} from '@verimaya/shared';
	import { contactStatusLabels, reportUrl } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { USE_MSW } from '$lib/env';
	import { formatDateTime, formatMoney, formatTime, isSameLocalDay } from '$lib/format';
	import { contactStatusTone } from '$lib/status-tone';
	import { canAccessPath, DEFAULT_ROLE } from '$lib/rbac';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type Page<T> = { items: T[]; next_cursor: string | null };

	const qs = useQueryScope();
	const role = $derived(qs.meQuery.data?.role ?? DEFAULT_ROLE);
	const canFinance = $derived(canAccessPath('/finance/ai-transaction', role));
	const canReports = $derived(canAccessPath('/reports', role));

	function pad2(n: number) {
		return String(n).padStart(2, '0');
	}

	function isoDay(d: Date) {
		return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
	}

	const currentMonthRange = (() => {
		const now = new Date();
		const first = new Date(now.getFullYear(), now.getMonth(), 1);
		const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		return { from: isoDay(first), to: isoDay(last) };
	})();

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>('/v1/tenants/current'),
		enabled: qs.ready
	}));

	const contactsQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.list({ limit: 20, for: 'panel-home' }),
		queryFn: () => apiGet<Page<Contact>>(listUrl('contacts', { limit: 20 })),
		enabled: qs.ready
	}));

	const appointmentsQuery = createQuery(() => ({
		queryKey: qs.keys.appointments.list({ limit: 40 }),
		queryFn: () => apiGet<Page<Appointment>>(listUrl('appointments', { limit: 40 })),
		enabled: qs.ready
	}));

	const inboxQuery = createQuery(() => ({
		queryKey: qs.keys.whatsapp.inbox(),
		queryFn: () => apiGet<{ messages: InboundMessage[] }>('/v1/whatsapp/inbox'),
		enabled: canFinance && qs.ready
	}));

	const summaryQuery = createQuery(() => ({
		queryKey: qs.keys.reports.dashboardSummary(currentMonthRange),
		queryFn: () => apiGet<ReportSummary>(reportUrl('summary', currentMonthRange)),
		enabled: !USE_MSW && canFinance && qs.ready
	}));

	/** All-time patient/file total — no from/to (period would become a funnel metric). */
	const contactDistributionQuery = createQuery(() => ({
		queryKey: qs.keys.reports.contactDistribution({ scope: 'all-time' }),
		queryFn: () => apiGet<ReportContactDistribution>(reportUrl('contact-distribution')),
		enabled: canReports && qs.ready
	}));

	const todayAppointments = $derived(
		(appointmentsQuery.data?.items ?? []).filter((a) => isSameLocalDay(a.starts_at)).slice(0, 5)
	);

	const recentContacts = $derived.by(() => {
		const items = contactsQuery.data?.items ?? [];
		const hasta = items.filter((c) => c.contact_type_name === 'Hasta');
		return (hasta.length > 0 ? hasta : items).slice(0, 5);
	});

	const openFilesValue = $derived(
		canReports && contactDistributionQuery.data != null
			? String(contactDistributionQuery.data.total)
			: '—'
	);
	const pendingMessages = $derived(
		(inboxQuery.data?.messages ?? []).filter((m) => m.status === 'new').slice(0, 5)
	);
	const pendingCount = $derived(
		(inboxQuery.data?.messages ?? []).filter((m) => m.status === 'new').length
	);

	const anyError = $derived(
		contactsQuery.isError ||
			appointmentsQuery.isError ||
			(canFinance && inboxQuery.isError) ||
			(!USE_MSW && canFinance && summaryQuery.isError)
	);

	const metricCards = $derived([
		{
			label: t('panel.home.metric.openFiles'),
			value: openFilesValue,
			hint: t('panel.home.metric.openFilesHint')
		},
		{
			label: t('panel.home.metric.todayAppts'),
			value: String(todayAppointments.length),
			hint: t('panel.home.metric.todayHint')
		},
		{
			label: t('panel.home.metric.waPending'),
			value: canFinance ? String(pendingCount) : '—',
			hint: canFinance ? t('panel.home.aiTransaction') : t('panel.home.metric.noPermission')
		},
		{
			label: t('panel.home.metric.netMonth'),
			value:
				!USE_MSW && canFinance && summaryQuery.data
					? formatMoney(summaryQuery.data.net_base, tenantQuery.data?.base_currency ?? 'TRY')
					: (tenantQuery.data?.base_currency ?? '—'),
			hint:
				!USE_MSW && canFinance
					? t('panel.home.metric.serverAggregate')
					: (tenantQuery.data?.name ?? t('panel.home.metric.organization'))
		}
	]);
</script>

<svelte:head>
	<title>Panel · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<PageHeader
		title={t('panel.home.title')}
		description={tenantQuery.data
			? t('panel.home.descriptionNamed', { name: tenantQuery.data.name })
			: t('panel.home.description')}
	/>

	{#if anyError}
		<div class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
			{t('panel.home.partialError')}
		</div>
	{/if}

	<div class="mb-8 grid min-w-0 gap-4 lg:grid-cols-3">
		<section class="min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-text">{t('panel.home.recentFiles')}</h2>
				<a href="/contacts" class="text-xs text-info hover:underline"
					>{t('panel.home.recentFilesAll')}</a
				>
			</div>
			{#if contactsQuery.isPending}
				<p class="text-sm text-text-faint">{t('panel.home.recentFilesLoading')}</p>
			{:else if contactsQuery.isError}
				<p class="text-sm text-danger">{t('panel.home.recentFilesError')}</p>
			{:else if recentContacts.length === 0}
				<p class="text-sm text-text-faint">{t('panel.home.recentFilesEmpty')}</p>
			{:else}
				<ul class="min-w-0 divide-y divide-border">
					{#each recentContacts as contact (contact.id)}
						<li class="min-w-0">
							<a
								href={`/contacts/${contact.id}`}
								class="flex min-w-0 items-center gap-2 rounded-[6px] px-1 py-2.5 transition-colors hover:bg-surface-2 sm:gap-3 sm:px-2"
							>
								<div class="min-w-0 flex-1 overflow-hidden">
									<p class="truncate text-sm font-medium text-text">{contact.display_name}</p>
									<p class="truncate text-xs text-text-faint">
										{formatDateTime(contact.updated_at)}
									</p>
								</div>
								{#if contact.status}
									<StatusBadge
										label={contactStatusLabels[contact.status]}
										tone={contactStatusTone(contact.status)}
									/>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-text">{t('panel.home.todayAppointments')}</h2>
				<a href="/appointments" class="text-xs text-info hover:underline">{t('panel.home.all')}</a>
			</div>
			{#if appointmentsQuery.isPending}
				<p class="text-sm text-text-faint">{t('panel.home.appointmentsLoading')}</p>
			{:else if appointmentsQuery.isError}
				<p class="text-sm text-danger">{t('panel.home.appointmentsError')}</p>
			{:else if todayAppointments.length === 0}
				<p class="text-sm text-text-faint">{t('panel.home.appointmentsEmpty')}</p>
			{:else}
				<ul class="min-w-0 divide-y divide-border">
					{#each todayAppointments as appt (appt.id)}
						<li class="min-w-0">
							<a
								href={appt.contact_id ? `/contacts/${appt.contact_id}` : '/appointments'}
								class="flex min-w-0 items-start gap-2 rounded-[6px] px-1 py-2.5 transition-colors hover:bg-surface-2 sm:gap-3 sm:px-2"
							>
								<span
									class="w-10 shrink-0 pt-0.5 text-sm font-medium text-brand tabular-nums sm:w-12"
								>
									{formatTime(appt.starts_at)}
								</span>
								<div class="min-w-0 flex-1 overflow-hidden">
									<p class="truncate text-sm font-medium text-text">{appt.contact_display_name}</p>
									<p class="truncate text-xs text-text-faint">
										{appt.title ?? appt.appointment_type ?? t('appointments.fallbackTitle')}
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
					<a href="/finance/ai-transaction" class="text-xs text-info hover:underline">
						{pendingCount > 0
							? t('panel.home.pendingNew', { count: String(pendingCount) })
							: t('panel.home.aiTransaction')}
					</a>
				{:else}
					<span class="text-xs text-text-faint">Finans yetkisi gerekli</span>
				{/if}
			</div>
			{#if !canFinance}
				<p class="text-sm text-text-faint">
					{t('panel.home.roleBlocked')}
				</p>
			{:else if inboxQuery.isPending}
				<p class="text-sm text-text-faint">{t('panel.home.messagesLoading')}</p>
			{:else if inboxQuery.isError}
				<p class="text-sm text-danger">{t('panel.home.messagesError')}</p>
			{:else if pendingMessages.length === 0}
				<p class="text-sm text-text-faint">{t('finance.ai.pending.empty')}</p>
			{:else}
				<ul class="min-w-0 divide-y divide-border">
					{#each pendingMessages as msg (msg.id)}
						<li class="min-w-0">
							<a
								href={`/finance/ai-transaction?inbox=${msg.id}`}
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
		<h2 class="mb-3 text-sm font-semibold text-text">{t('panel.home.metricsHeading')}</h2>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each metricCards as card (card.label)}
				<div class="rounded-lg border border-border bg-surface p-4">
					<p class="text-xs text-text-muted">{card.label}</p>
					<p class="mt-1 text-2xl font-semibold tracking-tight text-text">{card.value}</p>
					<p class="mt-1 text-xs text-text-faint">{card.hint}</p>
				</div>
			{/each}
		</div>
	</section>
</div>

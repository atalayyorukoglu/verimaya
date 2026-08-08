<script lang="ts">
	import { createInfiniteQuery, useQueryClient } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import type { ContractResponse, Patient, PatientCreate, PatientUpdate } from '@verimaya/shared';
	import { apiPaths, listUrl, patientStatusLabels } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDateTime } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import { patientStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import PatientFormDialog from '$lib/components/PatientFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';

	type PatientsPage = ContractResponse<'GET /v1/patients'>;

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	let q = $state('');
	let search = $state('');
	let formOpen = $state(false);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	const patientsQuery = createInfiniteQuery(() => ({
		queryKey: qs.keys.patients.list({ q: search }),
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<PatientsPage>(
				listUrl('patients', { limit: 25, q: search || undefined, cursor: pageParam })
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last: PatientsPage) => last.next_cursor,
		enabled: qs.ready
	}));

	const patients = $derived(patientsQuery.data?.pages.flatMap((p) => p.items) ?? []);
	const totalCount = $derived(patientsQuery.data?.pages[0]?.total_count);
	const listDescription = $derived(
		totalCount == null
			? t('patients.list.description')
			: search
				? `${t('patients.list.description')} · ${t('patients.list.totalFiltered', { count: String(totalCount) })}`
				: `${t('patients.list.description')} · ${t('patients.list.total', { count: String(totalCount) })}`
	);

	function submitSearch(e: Event) {
		e.preventDefault();
		search = q.trim();
	}

	async function createPatient(data: PatientCreate | PatientUpdate) {
		saving = true;
		formError = null;
		try {
			const created = await apiSend<Patient>(apiPaths.patients, 'POST', data);
			await queryClient.invalidateQueries({ queryKey: qs.keys.patients.all() });
			formOpen = false;
			await goto(`/patients/${created.id}`);
		} catch (err) {
			formError = err instanceof Error ? err.message : t('patients.list.createError');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{t('patients.list.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<PageHeader title={t('patients.list.title')} description={listDescription}>
		{#snippet actions()}
			<form class="flex min-w-0 flex-wrap gap-2" onsubmit={submitSearch}>
				<input
					bind:value={q}
					type="search"
					placeholder={t('patients.list.searchPlaceholder')}
					class="h-9 w-full min-w-0 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40 sm:w-56"
				/>
				<Button type="submit" variant="secondary">{t('patients.list.search')}</Button>
				<Button type="button" variant="outline" onclick={() => goto('/patients/duplicates')}
					>{t('patients.list.duplicates')}</Button
				>
				<Button type="button" onclick={() => (formOpen = true)}
					>{t('patients.list.newFile')}</Button
				>
			</form>
		{/snippet}
	</PageHeader>

	{#if patientsQuery.isPending}
		<p class="text-sm text-text-muted">{t('patients.list.loading')}</p>
	{:else if patientsQuery.isError}
		<p class="text-sm text-danger">{t('patients.list.loadError')}</p>
	{:else if patients.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm font-medium text-text">{t('patients.list.emptyTitle')}</p>
			<Button class="mt-4" type="button" onclick={() => (formOpen = true)}
				>{t('patients.list.emptyCta')}</Button
			>
		</div>
	{:else}
		<div class="hidden min-w-0 overflow-hidden rounded-lg border border-border bg-surface md:block">
			<table class="w-full table-fixed text-left text-sm">
				<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
					<tr>
						<th class="w-[32%] px-4 py-3 font-medium">{t('patients.list.col.name')}</th>
						<th class="w-[18%] px-4 py-3 font-medium">{t('patients.list.col.status')}</th>
						<th class="w-[18%] px-4 py-3 font-medium">{t('patients.list.col.phone')}</th>
						<th class="w-[16%] px-4 py-3 font-medium">{t('patients.list.col.updated')}</th>
						<th class="w-[16%] px-4 py-3 font-medium">{t('patients.list.col.source')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each patients as patient (patient.id)}
						<tr class="transition-colors hover:bg-surface-2/60">
							<td class="px-4 py-3">
								<a href={`/patients/${patient.id}`} class="font-medium text-text hover:underline">
									<span class="line-clamp-2 break-all">{patient.full_name}</span>
								</a>
							</td>
							<td class="px-4 py-3">
								<StatusBadge
									label={patientStatusLabels[patient.status]}
									tone={patientStatusTone(patient.status)}
								/>
							</td>
							<td class="truncate px-4 py-3 text-text-muted tabular-nums">{patient.phone ?? '—'}</td
							>
							<td class="px-4 py-3 whitespace-nowrap text-text-faint">
								{formatDateTime(patient.updated_at)}
							</td>
							<td class="truncate px-4 py-3 text-text-faint">{patient.source ?? '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<ul class="space-y-2 md:hidden">
			{#each patients as patient (patient.id)}
				<li class="min-w-0">
					<a
						href={`/patients/${patient.id}`}
						class="block min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
					>
						<div class="flex min-w-0 items-start gap-2">
							<p class="min-w-0 flex-1 text-sm font-medium break-all text-text">
								{patient.full_name}
							</p>
							<StatusBadge
								label={patientStatusLabels[patient.status]}
								tone={patientStatusTone(patient.status)}
							/>
						</div>
						<p class="mt-2 truncate text-xs text-text-muted">
							{patient.phone ?? t('patients.list.noPhone')}
						</p>
						{#if patient.source}
							<p class="mt-0.5 truncate text-xs text-text-faint">
								{t('patients.list.col.source')}: {patient.source}
							</p>
						{/if}
					</a>
				</li>
			{/each}
		</ul>

		{#if patientsQuery.hasNextPage}
			<div class="mt-4 flex justify-center">
				<Button
					variant="outline"
					type="button"
					disabled={patientsQuery.isFetchingNextPage}
					onclick={() => patientsQuery.fetchNextPage()}
				>
					{patientsQuery.isFetchingNextPage
						? t('patients.list.loading')
						: t('patients.list.loadMore')}
				</Button>
			</div>
		{/if}
	{/if}
</div>

<PatientFormDialog bind:open={formOpen} {saving} error={formError} onsubmit={createPatient} />

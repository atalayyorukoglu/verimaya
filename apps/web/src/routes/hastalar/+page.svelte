<script lang="ts">
	import { createInfiniteQuery, useQueryClient } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import type { Patient, PatientCreate, PatientUpdate } from '@verimaya/shared';
	import { patientStatusLabels } from '@verimaya/shared';
	import { apiGet, apiSend, listUrl } from '$lib/api';
	import { formatDateTime } from '$lib/format';
	import { patientStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import PatientFormDialog from '$lib/components/PatientFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';

	type Page = { items: Patient[]; next_cursor: string | null };

	const queryClient = useQueryClient();

	let q = $state('');
	let search = $state('');
	let formOpen = $state(false);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	const patientsQuery = createInfiniteQuery(() => ({
		queryKey: ['patients', { q: search }],
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<Page>(listUrl('patients', { limit: 25, q: search || undefined, cursor: pageParam })),
		initialPageParam: null as string | null,
		getNextPageParam: (last: Page) => last.next_cursor
	}));

	const patients = $derived(patientsQuery.data?.pages.flatMap((p) => p.items) ?? []);

	function submitSearch(e: Event) {
		e.preventDefault();
		search = q.trim();
	}

	async function createPatient(data: PatientCreate | PatientUpdate) {
		saving = true;
		formError = null;
		try {
			const created = await apiSend<Patient>('/v1/patients', 'POST', data);
			await queryClient.invalidateQueries({ queryKey: ['patients'] });
			formOpen = false;
			await goto(`/hastalar/${created.id}`);
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Kayıt başarısız';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Hastalar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<PageHeader title="Hastalar" description="Lead ve hasta kayıtları.">
		{#snippet actions()}
			<form class="flex min-w-0 flex-wrap gap-2" onsubmit={submitSearch}>
				<input
					bind:value={q}
					type="search"
					placeholder="Ad, e-posta veya telefon…"
					class="h-9 w-full min-w-0 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40 sm:w-56"
				/>
				<Button type="submit" variant="secondary">Ara</Button>
				<Button type="button" variant="outline" onclick={() => goto('/hastalar/cift-kayit')}
					>Çift kayıt tara</Button
				>
				<Button type="button" onclick={() => (formOpen = true)}>Yeni hasta</Button>
			</form>
		{/snippet}
	</PageHeader>

	{#if patientsQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if patientsQuery.isError}
		<p class="text-sm text-danger">Hasta listesi yüklenemedi.</p>
	{:else if patients.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm font-medium text-text">Hasta bulunamadı</p>
			<p class="mt-1 text-sm text-text-muted">
				Yeni hasta ekleyin veya MSW senaryosunu değiştirin.
			</p>
			<Button class="mt-4" type="button" onclick={() => (formOpen = true)}>Yeni hasta</Button>
		</div>
	{:else}
		<div class="hidden min-w-0 overflow-hidden rounded-lg border border-border bg-surface md:block">
			<table class="w-full table-fixed text-left text-sm">
				<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
					<tr>
						<th class="w-[32%] px-4 py-3 font-medium">Ad</th>
						<th class="w-[18%] px-4 py-3 font-medium">Durum</th>
						<th class="w-[16%] px-4 py-3 font-medium">Kaynak</th>
						<th class="w-[18%] px-4 py-3 font-medium">Telefon</th>
						<th class="w-[16%] px-4 py-3 font-medium">Güncelleme</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each patients as patient (patient.id)}
						<tr class="transition-colors hover:bg-surface-2/60">
							<td class="px-4 py-3">
								<a href={`/hastalar/${patient.id}`} class="font-medium text-text hover:underline">
									<span class="line-clamp-2 break-all">{patient.full_name}</span>
								</a>
							</td>
							<td class="px-4 py-3">
								<StatusBadge
									label={patientStatusLabels[patient.status]}
									tone={patientStatusTone(patient.status)}
								/>
							</td>
							<td class="truncate px-4 py-3 text-text-muted">{patient.source ?? '—'}</td>
							<td class="truncate px-4 py-3 text-text-muted tabular-nums">{patient.phone ?? '—'}</td
							>
							<td class="px-4 py-3 whitespace-nowrap text-text-faint">
								{formatDateTime(patient.updated_at)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<ul class="space-y-2 md:hidden">
			{#each patients as patient (patient.id)}
				<li class="min-w-0">
					<a
						href={`/hastalar/${patient.id}`}
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
							{patient.source ?? 'Kaynak yok'} · {patient.phone ?? 'Telefon yok'}
						</p>
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
					{patientsQuery.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla yükle'}
				</Button>
			</div>
		{/if}
	{/if}
</div>

<PatientFormDialog bind:open={formOpen} {saving} error={formError} onsubmit={createPatient} />

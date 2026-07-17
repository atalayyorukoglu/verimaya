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

<div class="mx-auto min-w-0 max-w-6xl">
	<PageHeader title="Hastalar" description="Lead ve hasta kayıtları.">
		{#snippet actions()}
			<form class="flex min-w-0 flex-wrap gap-2" onsubmit={submitSearch}>
				<input
					bind:value={q}
					type="search"
					placeholder="Ad, e-posta veya telefon…"
					class="border-border bg-surface text-text placeholder:text-text-faint h-9 w-full min-w-0 rounded-[6px] border px-3 text-sm outline-none focus:ring-2 focus:ring-brand/40 sm:w-56"
				/>
				<Button type="submit" variant="secondary">Ara</Button>
				<Button type="button" onclick={() => (formOpen = true)}>Yeni hasta</Button>
			</form>
		{/snippet}
	</PageHeader>

	{#if patientsQuery.isPending}
		<p class="text-text-muted text-sm">Yükleniyor…</p>
	{:else if patientsQuery.isError}
		<p class="text-danger text-sm">Hasta listesi yüklenemedi.</p>
	{:else if patients.length === 0}
		<div class="border-border bg-surface rounded-lg border p-8 text-center">
			<p class="text-text text-sm font-medium">Hasta bulunamadı</p>
			<p class="text-text-muted mt-1 text-sm">Yeni hasta ekleyin veya MSW senaryosunu değiştirin.</p>
			<Button class="mt-4" type="button" onclick={() => (formOpen = true)}>Yeni hasta</Button>
		</div>
	{:else}
		<div class="border-border bg-surface hidden min-w-0 overflow-hidden rounded-lg border md:block">
			<table class="w-full table-fixed text-left text-sm">
				<thead class="border-border bg-surface-2/50 text-text-muted border-b text-xs">
					<tr>
						<th class="w-[32%] px-4 py-3 font-medium">Ad</th>
						<th class="w-[18%] px-4 py-3 font-medium">Durum</th>
						<th class="w-[16%] px-4 py-3 font-medium">Kaynak</th>
						<th class="w-[18%] px-4 py-3 font-medium">Telefon</th>
						<th class="w-[16%] px-4 py-3 font-medium">Güncelleme</th>
					</tr>
				</thead>
				<tbody class="divide-border divide-y">
					{#each patients as patient (patient.id)}
						<tr class="hover:bg-surface-2/60 transition-colors">
							<td class="px-4 py-3">
								<a href={`/hastalar/${patient.id}`} class="text-text font-medium hover:underline">
									<span class="line-clamp-2 break-all">{patient.full_name}</span>
								</a>
							</td>
							<td class="px-4 py-3">
								<StatusBadge
									label={patientStatusLabels[patient.status]}
									tone={patientStatusTone(patient.status)}
								/>
							</td>
							<td class="text-text-muted truncate px-4 py-3">{patient.source ?? '—'}</td>
							<td class="text-text-muted truncate px-4 py-3 tabular-nums">{patient.phone ?? '—'}</td>
							<td class="text-text-faint px-4 py-3 whitespace-nowrap">
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
						class="border-border bg-surface hover:bg-surface-2 block min-w-0 overflow-hidden rounded-lg border p-4 transition-colors"
					>
						<div class="flex min-w-0 items-start gap-2">
							<p class="text-text min-w-0 flex-1 text-sm font-medium break-all">{patient.full_name}</p>
							<StatusBadge
								label={patientStatusLabels[patient.status]}
								tone={patientStatusTone(patient.status)}
							/>
						</div>
						<p class="text-text-muted mt-2 truncate text-xs">
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

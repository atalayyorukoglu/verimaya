<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { Patient } from '@verimaya/shared';
	import { patientStatusLabels } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { formatDateTime } from '$lib/format';
	import { patientStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type Page = { items: Patient[]; next_cursor: string | null };

	let q = $state('');
	let search = $state('');

	const patientsQuery = createQuery(() => ({
		queryKey: ['patients', { q: search, limit: 50 }],
		queryFn: () =>
			apiGet<Page>(listUrl('patients', { limit: 50, q: search || undefined }))
	}));

	function submitSearch(e: Event) {
		e.preventDefault();
		search = q.trim();
	}
</script>

<svelte:head>
	<title>Hastalar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-6xl">
	<PageHeader
		title="Hastalar"
		description="Lead ve hasta kayıtları — MSW senaryosu ile boş / uzun isim / 500 kayıt deneyebilirsiniz."
	>
		{#snippet actions()}
			<form class="flex gap-2" onsubmit={submitSearch}>
				<input
					bind:value={q}
					type="search"
					placeholder="Ad, e-posta veya telefon…"
					class="border-border bg-surface text-text placeholder:text-text-faint h-9 w-56 rounded-[6px] border px-3 text-sm outline-none focus:ring-2 focus:ring-brand/40"
				/>
				<button
					type="submit"
					class="bg-brand text-primary-foreground hover:bg-brand-hover h-9 rounded-[6px] px-3 text-sm font-medium"
				>
					Ara
				</button>
			</form>
		{/snippet}
	</PageHeader>

	{#if patientsQuery.isPending}
		<p class="text-text-muted text-sm">Yükleniyor…</p>
	{:else if patientsQuery.isError}
		<p class="text-danger text-sm">Hasta listesi yüklenemedi.</p>
	{:else if (patientsQuery.data?.items.length ?? 0) === 0}
		<div class="border-border bg-surface rounded-lg border p-8 text-center">
			<p class="text-text text-sm font-medium">Hasta bulunamadı</p>
			<p class="text-text-muted mt-1 text-sm">
				Boş senaryodasınız veya arama sonucu yok. Sağ alttaki MSW menüsünden “Demo” seçin.
			</p>
		</div>
	{:else}
		<!-- Desktop table -->
		<div class="border-border bg-surface hidden overflow-hidden rounded-lg border md:block">
			<table class="w-full text-left text-sm">
				<thead class="border-border bg-surface-2/50 text-text-muted border-b text-xs">
					<tr>
						<th class="px-4 py-3 font-medium">Ad</th>
						<th class="px-4 py-3 font-medium">Durum</th>
						<th class="px-4 py-3 font-medium">Kaynak</th>
						<th class="px-4 py-3 font-medium">Telefon</th>
						<th class="px-4 py-3 font-medium">Güncelleme</th>
					</tr>
				</thead>
				<tbody class="divide-border divide-y">
					{#each patientsQuery.data?.items ?? [] as patient (patient.id)}
						<tr class="hover:bg-surface-2/60 transition-colors">
							<td class="px-4 py-3">
								<a href={`/hastalar/${patient.id}`} class="text-text font-medium hover:underline">
									<span class="line-clamp-2 max-w-xs break-all">{patient.full_name}</span>
								</a>
							</td>
							<td class="px-4 py-3">
								<StatusBadge
									label={patientStatusLabels[patient.status]}
									tone={patientStatusTone(patient.status)}
								/>
							</td>
							<td class="text-text-muted px-4 py-3">{patient.source ?? '—'}</td>
							<td class="text-text-muted px-4 py-3 tabular-nums">{patient.phone ?? '—'}</td>
							<td class="text-text-faint px-4 py-3 whitespace-nowrap">
								{formatDateTime(patient.updated_at)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Mobile cards -->
		<ul class="space-y-2 md:hidden">
			{#each patientsQuery.data?.items ?? [] as patient (patient.id)}
				<li>
					<a
						href={`/hastalar/${patient.id}`}
						class="border-border bg-surface hover:bg-surface-2 block rounded-lg border p-4 transition-colors"
					>
						<div class="flex items-start justify-between gap-2">
							<p class="text-text text-sm font-medium break-all">{patient.full_name}</p>
							<StatusBadge
								label={patientStatusLabels[patient.status]}
								tone={patientStatusTone(patient.status)}
							/>
						</div>
						<p class="text-text-muted mt-2 text-xs">
							{patient.source ?? 'Kaynak yok'} · {patient.phone ?? 'Telefon yok'}
						</p>
					</a>
				</li>
			{/each}
		</ul>

		{#if patientsQuery.data?.next_cursor}
			<p class="text-text-faint mt-4 text-center text-xs">
				Daha fazla kayıt var (cursor: {patientsQuery.data.next_cursor}) — sonraki oturumda “daha fazla
				yükle” eklenecek.
			</p>
		{/if}
	{/if}
</div>

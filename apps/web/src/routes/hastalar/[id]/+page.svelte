<script lang="ts">
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import type { Patient } from '@verimaya/shared';
	import { patientStatusLabels } from '@verimaya/shared';
	import { apiGet } from '$lib/api';
	import { formatDateTime } from '$lib/format';
	import { patientStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	const id = $derived(page.params.id!);

	const patientQuery = createQuery(() => ({
		queryKey: ['patients', id],
		queryFn: () => apiGet<Patient>(`/v1/patients/${id}`)
	}));
</script>

<svelte:head>
	<title>
		{patientQuery.data?.full_name ?? 'Hasta'} · Verimaya
	</title>
</svelte:head>

<div class="mx-auto max-w-3xl">
	<a href="/hastalar" class="text-info mb-4 inline-block text-sm hover:underline">← Hastalar</a>

	{#if patientQuery.isPending}
		<p class="text-text-muted text-sm">Yükleniyor…</p>
	{:else if patientQuery.isError}
		<div class="border-border bg-surface rounded-lg border p-6">
			<p class="text-danger text-sm">Hasta bulunamadı veya yüklenemedi.</p>
		</div>
	{:else if patientQuery.data}
		{@const patient = patientQuery.data}
		<PageHeader title={patient.full_name}>
			{#snippet actions()}
				<StatusBadge
					label={patientStatusLabels[patient.status]}
					tone={patientStatusTone(patient.status)}
				/>
			{/snippet}
		</PageHeader>

		<dl class="border-border bg-surface divide-border divide-y rounded-lg border">
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-text-muted text-xs font-medium">Telefon</dt>
				<dd class="text-text text-sm tabular-nums">{patient.phone ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-text-muted text-xs font-medium">E-posta</dt>
				<dd class="text-text text-sm break-all">{patient.email ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-text-muted text-xs font-medium">Kaynak</dt>
				<dd class="text-text text-sm">{patient.source ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-text-muted text-xs font-medium">Oluşturulma</dt>
				<dd class="text-text text-sm">{formatDateTime(patient.created_at)}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-start">
				<dt class="text-text-muted text-xs font-medium">Notlar</dt>
				<dd class="text-text text-sm whitespace-pre-wrap">{patient.notes ?? '—'}</dd>
			</div>
		</dl>
	{/if}
</div>

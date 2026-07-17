<script lang="ts">
	import { page } from '$app/state';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { Patient, PatientUpdate } from '@verimaya/shared';
	import { patientStatusLabels } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { formatDateTime } from '$lib/format';
	import { patientStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import PatientFormDialog from '$lib/components/PatientFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';

	const queryClient = useQueryClient();
	const id = $derived(page.params.id!);

	let formOpen = $state(false);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	const patientQuery = createQuery(() => ({
		queryKey: ['patients', id],
		queryFn: () => apiGet<Patient>(`/v1/patients/${id}`)
	}));

	async function updatePatient(data: PatientUpdate) {
		saving = true;
		formError = null;
		try {
			await apiSend<Patient>(`/v1/patients/${id}`, 'PATCH', data);
			await queryClient.invalidateQueries({ queryKey: ['patients'] });
			formOpen = false;
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Kayıt başarısız';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>
		{patientQuery.data?.full_name ?? 'Hasta'} · Verimaya
	</title>
</svelte:head>

<div class="mx-auto min-w-0 max-w-3xl">
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
				<Button type="button" variant="secondary" onclick={() => (formOpen = true)}>Düzenle</Button>
			{/snippet}
		</PageHeader>

		<dl class="border-border bg-surface divide-border divide-y overflow-hidden rounded-lg border">
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-text-muted text-xs font-medium">Telefon</dt>
				<dd class="text-text text-sm break-all tabular-nums">{patient.phone ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-text-muted text-xs font-medium">E-posta</dt>
				<dd class="text-text text-sm break-all">{patient.email ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-text-muted text-xs font-medium">Kaynak</dt>
				<dd class="text-text text-sm break-words">{patient.source ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-text-muted text-xs font-medium">Oluşturulma</dt>
				<dd class="text-text text-sm">{formatDateTime(patient.created_at)}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-start">
				<dt class="text-text-muted text-xs font-medium">Notlar</dt>
				<dd class="text-text text-sm break-words whitespace-pre-wrap">{patient.notes ?? '—'}</dd>
			</div>
		</dl>

		<PatientFormDialog
			bind:open={formOpen}
			{patient}
			{saving}
			error={formError}
			onsubmit={updatePatient}
		/>
	{/if}
</div>

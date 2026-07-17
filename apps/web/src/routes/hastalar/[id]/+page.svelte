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

<div class="mx-auto max-w-3xl min-w-0">
	<a href="/hastalar" class="mb-4 inline-block text-sm text-info hover:underline">← Hastalar</a>

	{#if patientQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if patientQuery.isError}
		<div class="rounded-lg border border-border bg-surface p-6">
			<p class="text-sm text-danger">Hasta bulunamadı veya yüklenemedi.</p>
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

		<dl class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">Telefon</dt>
				<dd class="text-sm break-all text-text tabular-nums">{patient.phone ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">E-posta</dt>
				<dd class="text-sm break-all text-text">{patient.email ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">Kaynak</dt>
				<dd class="text-sm break-words text-text">{patient.source ?? '—'}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
				<dt class="text-xs font-medium text-text-muted">Oluşturulma</dt>
				<dd class="text-sm text-text">{formatDateTime(patient.created_at)}</dd>
			</div>
			<div class="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:items-start">
				<dt class="text-xs font-medium text-text-muted">Notlar</dt>
				<dd class="text-sm break-words whitespace-pre-wrap text-text">{patient.notes ?? '—'}</dd>
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

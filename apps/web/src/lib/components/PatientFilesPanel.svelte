<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { Appointment, PatientFile } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { formatBytes, formatDateTime } from '$lib/format';
	import { Button } from '$lib/components/ui/button';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';

	let {
		patientId,
		appointments = []
	}: {
		patientId: string;
		appointments?: Appointment[];
	} = $props();

	const queryClient = useQueryClient();
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let linkAppointmentId = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	const filesQuery = createQuery(() => ({
		queryKey: ['patient-files', patientId],
		queryFn: () => apiGet<{ items: PatientFile[] }>(`/v1/patients/${patientId}/files`)
	}));

	const files = $derived(filesQuery.data?.items ?? []);

	async function onFilePicked(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		uploading = true;
		uploadError = null;
		try {
			await apiSend<PatientFile>(`/v1/patients/${patientId}/files`, 'POST', {
				filename: file.name,
				mime_type: file.type || 'application/octet-stream',
				size_bytes: file.size,
				appointment_id: linkAppointmentId || null
			});
			await queryClient.invalidateQueries({ queryKey: ['patient-files', patientId] });
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Yükleme başarısız';
		} finally {
			uploading = false;
		}
	}

	async function removeFile(file: PatientFile) {
		try {
			await apiSend(`/v1/patients/${patientId}/files/${file.id}`, 'DELETE');
			await queryClient.invalidateQueries({ queryKey: ['patient-files', patientId] });
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Silme başarısız';
		}
	}
</script>

<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-sm font-semibold text-text">Dosyalar</h2>
		<div class="flex flex-wrap items-center gap-2">
			{#if appointments.length > 0}
				<select
					class="h-8 max-w-[14rem] rounded-[6px] border border-border bg-surface-2 px-2 text-xs text-text outline-none focus:ring-2 focus:ring-brand/40"
					bind:value={linkAppointmentId}
					aria-label="Randevuya bağla"
				>
					<option value="">Hasta dosyası (randevusuz)</option>
					{#each appointments as a (a.id)}
						<option value={a.id}>
							{a.starts_at.slice(0, 10)} · {a.title ?? 'Randevu'}
						</option>
					{/each}
				</select>
			{/if}
			<input
				bind:this={fileInput}
				type="file"
				class="sr-only"
				onchange={onFilePicked}
				accept=".pdf,.png,.jpg,.jpeg,.webp,.gif"
			/>
			<Button
				type="button"
				variant="secondary"
				size="sm"
				disabled={uploading}
				onclick={() => fileInput?.click()}
			>
				<Upload class="size-3.5" />
				{uploading ? 'Yükleniyor…' : 'Yükle'}
			</Button>
		</div>
	</div>

	{#if uploadError}
		<p class="mt-2 text-xs text-danger">{uploadError}</p>
	{/if}

	{#if filesQuery.isPending}
		<p class="mt-3 text-sm text-text-muted">Yükleniyor…</p>
	{:else if files.length === 0}
		<div class="mt-3 flex flex-col items-center gap-2 py-4 text-center">
			<span
				class="flex size-10 items-center justify-center rounded-full bg-surface-2 text-text-muted"
			>
				<Paperclip class="size-5" />
			</span>
			<p class="text-sm font-medium text-text">Henüz dosya yok</p>
			<p class="max-w-sm text-xs leading-relaxed text-text-muted">
				Pasaport, onam formu veya ziyaret fotoğraflarını yükleyin. Demo’da içerik saklanmaz; yalnızca
				metadata listelenir.
			</p>
		</div>
	{:else}
		<ul class="mt-3 divide-y divide-border">
			{#each files as file (file.id)}
				<li class="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
					<div class="flex min-w-0 flex-1 gap-2.5">
						<span
							class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-surface-2 text-text-muted"
						>
							<Paperclip class="size-3.5" />
						</span>
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-text">{file.filename}</p>
							<p class="text-xs text-text-faint">
								{formatBytes(file.size_bytes)} · {formatDateTime(file.created_at)}
								{#if file.uploaded_by_display_name}
									· {file.uploaded_by_display_name}
								{/if}
							</p>
							{#if file.appointment_label}
								<span
									class="mt-1 inline-block rounded-[4px] bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
								>
									{file.appointment_label}
								</span>
							{/if}
						</div>
					</div>
					<button
						type="button"
						class="shrink-0 cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger"
						aria-label="Dosyayı sil"
						onclick={() => removeFile(file)}
					>
						<Trash2 class="size-3.5" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

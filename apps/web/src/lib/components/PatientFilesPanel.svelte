<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		apiPaths,
		type Appointment,
		type PatientFile,
		type PatientFilePresignResponse
	} from '@verimaya/shared';
	import { apiGet, apiSend, resolveApiUrl } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatBytes, formatDateTime } from '$lib/format';
	import { Button } from '$lib/components/ui/button';
	import Download from '@lucide/svelte/icons/download';
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
	const qs = useQueryScope();
	let uploading = $state(false);
	let uploadProgress = $state<number | null>(null);
	let uploadError = $state<string | null>(null);
	let linkAppointmentId = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	const filesQuery = createQuery(() => ({
		queryKey: qs.keys.patients.files(patientId),
		queryFn: () => apiGet<{ items: PatientFile[] }>(`/v1/patients/${patientId}/files`),
		enabled: qs.ready
	}));

	const files = $derived(filesQuery.data?.items ?? []);

	function putWithProgress(
		url: string,
		file: File,
		onProgress: (pct: number) => void
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('PUT', url);
			// Cookie auth only for our API content endpoint — not for S3/R2 presigned URLs.
			xhr.withCredentials = url.includes('/v1/patients/');
			if (file.type) xhr.setRequestHeader('Content-Type', file.type);
			xhr.upload.onprogress = (ev) => {
				if (ev.lengthComputable) {
					onProgress(Math.round((ev.loaded / ev.total) * 100));
				}
			};
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) resolve();
				else reject(new Error(`Yükleme başarısız (${xhr.status})`));
			};
			xhr.onerror = () => reject(new Error('Yükleme ağı hatası'));
			xhr.send(file);
		});
	}

	async function uploadViaPresign(file: File): Promise<void> {
		const presign = await apiSend<PatientFilePresignResponse>(
			apiPaths.patientFilesPresign(patientId),
			'POST',
			{
				filename: file.name,
				mime_type: file.type || 'application/octet-stream',
				size_bytes: file.size,
				appointment_id: linkAppointmentId || null
			}
		);

		uploadProgress = 0;
		const targetUrl = resolveApiUrl(presign.upload_url);
		await putWithProgress(targetUrl, file, (pct) => {
			uploadProgress = pct;
		});
		await apiSend(apiPaths.patientFileConfirm(patientId, presign.file_id), 'POST');
	}

	async function onFilePicked(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;

		uploading = true;
		uploadProgress = null;
		uploadError = null;
		try {
			await uploadViaPresign(file);
			await queryClient.invalidateQueries({ queryKey: qs.keys.patients.files(patientId) });
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Yükleme başarısız';
		} finally {
			uploading = false;
			uploadProgress = null;
		}
	}

	async function removeFile(file: PatientFile) {
		try {
			await apiSend(`/v1/patients/${patientId}/files/${file.id}`, 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.patients.files(patientId) });
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Silme başarısız';
		}
	}

	async function downloadFile(file: PatientFile) {
		uploadError = null;
		try {
			const res = await fetch(resolveApiUrl(apiPaths.patientFileDownload(patientId, file.id)), {
				credentials: 'include',
				headers: { Accept: '*/*' }
			});
			if (!res.ok) {
				throw new Error(`İndirme başarısız (${res.status})`);
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = file.filename;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'İndirme başarısız';
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
				{uploading
					? uploadProgress != null
						? `Yükleniyor ${uploadProgress}%`
						: 'Yükleniyor…'
					: 'Yükle'}
			</Button>
		</div>
	</div>

	{#if uploading && uploadProgress != null}
		<div
			class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
			role="progressbar"
			aria-valuenow={uploadProgress}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<div class="h-full bg-brand transition-[width]" style={`width: ${uploadProgress}%`}></div>
		</div>
	{/if}

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
				Pasaport, onam formu veya ziyaret fotoğraflarını yükleyin. Büyük dosyalar doğrudan
				depolamaya gider (presigned).
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
								{#if file.status === 'pending'}
									· bekliyor
								{/if}
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
					<div class="flex shrink-0 items-center gap-0.5">
						{#if file.status !== 'pending'}
							<button
								type="button"
								class="cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-text"
								aria-label="Dosyayı indir"
								onclick={() => downloadFile(file)}
							>
								<Download class="size-3.5" />
							</button>
						{/if}
						<button
							type="button"
							class="cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger"
							aria-label="Dosyayı sil"
							onclick={() => removeFile(file)}
						>
							<Trash2 class="size-3.5" />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

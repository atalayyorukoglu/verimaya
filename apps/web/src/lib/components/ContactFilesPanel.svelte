<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		apiPaths,
		isInlineSafeContactFileMimeType,
		type Appointment,
		type ContactFile,
		type ContactFilePresignResponse
	} from '@verimaya/shared';
	import { apiGet, apiSend, resolveApiUrl } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatBytes, formatDateTime } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import { Button } from '$lib/components/ui/button';
	import Download from '@lucide/svelte/icons/download';
	import Eye from '@lucide/svelte/icons/eye';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';

	let {
		contactId,
		appointments = []
	}: {
		contactId: string;
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
		queryKey: qs.keys.contacts.files(contactId),
		queryFn: () => apiGet<{ items: ContactFile[] }>(apiPaths.contactFiles(contactId)),
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
			xhr.withCredentials = url.includes('/v1/contacts/');
			if (file.type) xhr.setRequestHeader('Content-Type', file.type);
			xhr.upload.onprogress = (ev) => {
				if (ev.lengthComputable) {
					onProgress(Math.round((ev.loaded / ev.total) * 100));
				}
			};
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) resolve();
				else
					reject(new Error(t('contacts.files.uploadFailedStatus', { status: String(xhr.status) })));
			};
			xhr.onerror = () => reject(new Error(t('contacts.files.uploadNetworkError')));
			xhr.send(file);
		});
	}

	async function uploadViaPresign(file: File): Promise<void> {
		const presign = await apiSend<ContactFilePresignResponse>(
			apiPaths.contactFilesPresign(contactId),
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
		await apiSend(apiPaths.contactFileConfirm(contactId, presign.file_id), 'POST');
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
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.files(contactId) });
		} catch (err) {
			uploadError = err instanceof Error ? err.message : t('contacts.files.uploadFailed');
		} finally {
			uploading = false;
			uploadProgress = null;
		}
	}

	async function removeFile(file: ContactFile) {
		if (!confirm(t('contacts.files.deleteConfirm', { filename: file.filename }))) return;
		try {
			await apiSend(apiPaths.contactFile(contactId, file.id), 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.files(contactId) });
		} catch (err) {
			uploadError = err instanceof Error ? err.message : t('contacts.files.deleteFailed');
		}
	}

	async function downloadFile(file: ContactFile) {
		uploadError = null;
		try {
			const res = await fetch(resolveApiUrl(apiPaths.contactFileDownload(contactId, file.id)), {
				credentials: 'include',
				headers: { Accept: '*/*' }
			});
			if (!res.ok) {
				throw new Error(t('contacts.files.downloadFailedStatus', { status: String(res.status) }));
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = file.filename;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			uploadError = err instanceof Error ? err.message : t('contacts.files.downloadFailed');
		}
	}

	async function previewFile(file: ContactFile) {
		uploadError = null;
		try {
			const res = await fetch(resolveApiUrl(apiPaths.contactFilePreview(contactId, file.id)), {
				credentials: 'include',
				headers: { Accept: '*/*' }
			});
			if (!res.ok) {
				throw new Error(t('contacts.files.previewFailedStatus', { status: String(res.status) }));
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			if (isInlineSafeContactFileMimeType(file.mime_type)) {
				window.open(url, '_blank', 'noopener,noreferrer');
				window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
			} else {
				const a = document.createElement('a');
				a.href = url;
				a.download = file.filename;
				a.click();
				URL.revokeObjectURL(url);
			}
		} catch (err) {
			uploadError = err instanceof Error ? err.message : t('contacts.files.previewFailed');
		}
	}
</script>

<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-sm font-semibold text-text">{t('contacts.files.title')}</h2>
		<div class="flex flex-wrap items-center gap-2">
			<select
				class="h-8 max-w-[18rem] rounded-[6px] border border-border bg-surface-2 px-2 text-xs text-text outline-none focus:ring-2 focus:ring-brand/40"
				bind:value={linkAppointmentId}
				aria-label={t('contacts.files.linkAppointment')}
			>
				<option value="">{t('contacts.files.noAppointment')}</option>
				{#each appointments as a (a.id)}
					<option value={a.id}>
						{a.starts_at.slice(0, 10)} · {a.title ?? t('contacts.files.appointmentFallback')}
					</option>
				{/each}
			</select>
			<input
				bind:this={fileInput}
				type="file"
				class="sr-only"
				onchange={onFilePicked}
				accept=".pdf,.png,.jpg,.jpeg,.webp"
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
						? t('contacts.files.uploadingProgress', { progress: String(uploadProgress) })
						: t('contacts.files.uploading')
					: t('contacts.files.upload')}
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
		<p class="mt-3 text-sm text-text-muted">{t('contacts.files.loading')}</p>
	{:else if files.length === 0}
		<div class="mt-3 flex flex-col items-center gap-2 py-4 text-center">
			<span
				class="flex size-10 items-center justify-center rounded-full bg-surface-2 text-text-muted"
			>
				<Paperclip class="size-5" />
			</span>
			<p class="text-sm font-medium text-text">{t('contacts.files.emptyTitle')}</p>
			<p class="max-w-sm text-xs leading-relaxed text-text-muted">
				{t('contacts.files.emptyBody')}
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
									· {t('contacts.files.pending')}
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
								aria-label={t('contacts.files.previewAria')}
								onclick={() => previewFile(file)}
							>
								<Eye class="size-3.5" />
							</button>
							<button
								type="button"
								class="cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-text"
								aria-label={t('contacts.files.downloadAria')}
								onclick={() => downloadFile(file)}
							>
								<Download class="size-3.5" />
							</button>
						{/if}
						<button
							type="button"
							class="cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger"
							aria-label={t('contacts.files.deleteAria')}
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

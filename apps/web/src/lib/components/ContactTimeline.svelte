<script lang="ts">
	/*
	 * Kişi kartının gövdesi: not, olay ve dosya tek bir zaman çizgisinde.
	 *
	 * Neden: "Olaylar" ve "Dosyalar" ayrı bölümler + ayrı pencereler olarak duruyordu ve
	 * kimse doldurmuyordu (kullanıcı gözlemi, 2026-09-02). Olay kaydı açmak bir modal ve
	 * dört zorunlu alan demekti; insanlar onun yerine hiçbir şey yazmıyordu. Oysa açık
	 * olaylar müdahale listesini besliyor (`interventions.service.ts` → `open_incident`),
	 * yani boş kalan bölüm ürünün teşhis döngüsünü de boş bırakıyordu.
	 *
	 * Çözüm bölümleri silmek değil, FORMU silmek: yazmak varsayılan, işaretlemek tek tık.
	 * Veri modeli ve raporlar aynı kalır — burada yalnız üç var olan uç birleştirilir.
	 *
	 * Twist'ten alınan ders: düz akış gömer. O yüzden açık olaylar üstte sabit kalır ve
	 * filtre şeritleri var; "bitene kadar açık duran şey" görünürlüğünü kaybetmez.
	 */
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		apiPaths,
		type Appointment,
		type ContactCaseNote,
		type ContactFile,
		type ContactFilePresignResponse,
		type Incident,
		type IncidentType
	} from '@verimaya/shared';
	import { apiGet, apiSend, listUrl, resolveApiUrl } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatBytes, formatDateTime } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import AlertTriangle from '@lucide/svelte/icons/triangle-alert';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Check from '@lucide/svelte/icons/check';
	import Download from '@lucide/svelte/icons/download';
	import Eye from '@lucide/svelte/icons/eye';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let {
		contactId,
		appointments = [],
		canWrite = true
	}: {
		contactId: string;
		appointments?: Appointment[];
		canWrite?: boolean;
	} = $props();

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const notesQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.caseNotes(contactId),
		queryFn: () => apiGet<{ items: ContactCaseNote[] }>(apiPaths.contactCaseNotes(contactId)),
		enabled: qs.ready
	}));

	const filesQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.files(contactId),
		queryFn: () => apiGet<{ items: ContactFile[] }>(apiPaths.contactFiles(contactId)),
		enabled: qs.ready
	}));

	const incidentsQuery = createQuery(() => ({
		queryKey: qs.keys.incidents.list({ contact_id: contactId }),
		queryFn: () =>
			apiGet<{ items: Incident[] }>(listUrl('incidents', { contact_id: contactId, limit: 100 })),
		enabled: qs.ready
	}));

	const incidentTypesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.incidentTypes(),
		queryFn: () => apiGet<{ items: IncidentType[] }>(apiPaths.settingsIncidentTypes),
		enabled: qs.ready
	}));

	type TimelineItem =
		| { kind: 'note'; id: string; at: string; note: ContactCaseNote }
		| { kind: 'file'; id: string; at: string; file: ContactFile }
		| { kind: 'incident'; id: string; at: string; incident: Incident };

	const incidentTypes = $derived(incidentTypesQuery.data?.items ?? []);
	const incidents = $derived(incidentsQuery.data?.items ?? []);
	const openIncidents = $derived(incidents.filter((i) => i.status === 'open'));

	/** Eskiden yeniye — mesajlaşma sırası; yazma alanı altta. */
	const items = $derived.by((): TimelineItem[] => {
		const merged: TimelineItem[] = [
			...(notesQuery.data?.items ?? []).map((note): TimelineItem => ({
				kind: 'note',
				id: note.id,
				at: note.created_at,
				note
			})),
			...(filesQuery.data?.items ?? []).map((file): TimelineItem => ({
				kind: 'file',
				id: file.id,
				at: file.created_at,
				file
			})),
			...incidents.map((incident): TimelineItem => ({
				kind: 'incident',
				id: incident.id,
				at: incident.created_at,
				incident
			}))
		];
		return merged.sort((a, b) => a.at.localeCompare(b.at));
	});

	type Filter = 'all' | 'incident' | 'file';
	let filter = $state<Filter>('all');
	const visibleItems = $derived(filter === 'all' ? items : items.filter((i) => i.kind === filter));

	/*
	 * Üç kaynak birbirinden bağımsız: biri düşerse akış kararmaz, gelen gösterilir.
	 * Somut sebep — MSW sahte katmanında olay uçları yok (`lib/mocks/handlers.ts`),
	 * yani geliştirme modunda `incidents` her zaman hata verir; "hepsi hata ise hata"
	 * kuralı olmasaydı notlar da görünmezdi. Aynı koruma canlıda da işe yarar:
	 * tek uç 500 dönse kişi kartı boş kalmaz.
	 */
	const isPending = $derived(
		notesQuery.isPending && filesQuery.isPending && incidentsQuery.isPending
	);
	const isError = $derived(notesQuery.isError && filesQuery.isError && incidentsQuery.isError);

	let draft = $state('');
	let asIncident = $state(false);
	let incidentTypeId = $state('');
	let linkAppointmentId = $state('');
	let sending = $state(false);
	let uploading = $state(false);
	let uploadProgress = $state<number | null>(null);
	let busyId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let listEl: HTMLDivElement | undefined = $state();
	let fileInput: HTMLInputElement | undefined = $state();

	/** Son kullanılan tür hatırlanır; olay işaretlemek çoğu zaman tek tık kalsın. */
	$effect(() => {
		if (!incidentTypeId && incidentTypes.length > 0) incidentTypeId = incidentTypes[0]!.id;
	});

	function scrollToBottom() {
		if (listEl) listEl.scrollTop = listEl.scrollHeight;
	}

	async function refresh(keys: 'notes' | 'files' | 'incidents') {
		const key =
			keys === 'notes'
				? qs.keys.contacts.caseNotes(contactId)
				: keys === 'files'
					? qs.keys.contacts.files(contactId)
					: qs.keys.incidents.list({ contact_id: contactId });
		await queryClient.invalidateQueries({ queryKey: key });
	}

	function todayIso(): string {
		return new Date().toISOString().slice(0, 10);
	}

	async function send() {
		const body = draft.trim();
		if (!body || sending || !canWrite) return;
		sending = true;
		error = null;
		try {
			if (asIncident) {
				if (!incidentTypeId) {
					error = t('contacts.timeline.needsIncidentType');
					return;
				}
				await apiSend(apiPaths.incidents, 'POST', {
					contact_id: contactId,
					incident_type_id: incidentTypeId,
					appointment_id: linkAppointmentId || null,
					description: body,
					occurred_on: todayIso()
				});
				await refresh('incidents');
				asIncident = false;
			} else {
				await apiSend(apiPaths.contactCaseNotes(contactId), 'POST', { body });
				await refresh('notes');
			}
			draft = '';
			requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
		} catch (err) {
			error = err instanceof Error ? err.message : t('contacts.notes.sendFailed');
		} finally {
			sending = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	}

	function putWithProgress(url: string, file: File, onProgress: (pct: number) => void) {
		return new Promise<void>((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('PUT', url);
			// Çerez kimliği yalnız kendi içerik ucumuz için; S3/R2 presign URL'ine gitmez.
			xhr.withCredentials = url.includes('/v1/contacts/');
			if (file.type) xhr.setRequestHeader('Content-Type', file.type);
			xhr.upload.onprogress = (ev) => {
				if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
			};
			xhr.onload = () =>
				xhr.status >= 200 && xhr.status < 300
					? resolve()
					: reject(
							new Error(t('contacts.files.uploadFailedStatus', { status: String(xhr.status) }))
						);
			xhr.onerror = () => reject(new Error(t('contacts.files.uploadNetworkError')));
			xhr.send(file);
		});
	}

	async function onFilePicked(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !canWrite) return;
		uploading = true;
		uploadProgress = null;
		error = null;
		try {
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
			await putWithProgress(resolveApiUrl(presign.upload_url), file, (pct) => {
				uploadProgress = pct;
			});
			await apiSend(apiPaths.contactFileConfirm(contactId, presign.file_id), 'POST');
			await refresh('files');
			requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
		} catch (err) {
			error = err instanceof Error ? err.message : t('contacts.files.uploadFailed');
		} finally {
			uploading = false;
			uploadProgress = null;
		}
	}

	async function fetchFileBlob(file: ContactFile, path: string): Promise<Blob> {
		const res = await fetch(resolveApiUrl(path), {
			credentials: 'include',
			headers: { Accept: '*/*' }
		});
		if (!res.ok) {
			throw new Error(t('contacts.files.downloadFailedStatus', { status: String(res.status) }));
		}
		return res.blob();
	}

	async function downloadFile(file: ContactFile) {
		error = null;
		try {
			const blob = await fetchFileBlob(file, apiPaths.contactFileDownload(contactId, file.id));
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = file.filename;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			error = err instanceof Error ? err.message : t('contacts.files.downloadFailed');
		}
	}

	async function previewFile(file: ContactFile) {
		error = null;
		try {
			const blob = await fetchFileBlob(file, apiPaths.contactFilePreview(contactId, file.id));
			const url = URL.createObjectURL(blob);
			window.open(url, '_blank', 'noopener');
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
		} catch (err) {
			error = err instanceof Error ? err.message : t('contacts.files.previewFailed');
		}
	}

	async function removeNote(id: string) {
		if (!canWrite || busyId) return;
		if (!confirm(t('contacts.notes.deleteConfirm'))) return;
		busyId = id;
		error = null;
		try {
			await apiSend(`${apiPaths.contactCaseNotes(contactId)}/${id}`, 'DELETE');
			await refresh('notes');
		} catch (err) {
			error = err instanceof Error ? err.message : t('contacts.notes.deleteFailed');
		} finally {
			busyId = null;
		}
	}

	async function removeFile(file: ContactFile) {
		if (!canWrite || busyId) return;
		if (!confirm(t('contacts.files.deleteConfirm', { filename: file.filename }))) return;
		busyId = file.id;
		error = null;
		try {
			await apiSend(apiPaths.contactFile(contactId, file.id), 'DELETE');
			await refresh('files');
		} catch (err) {
			error = err instanceof Error ? err.message : t('contacts.files.deleteFailed');
		} finally {
			busyId = null;
		}
	}

	async function resolveIncident(id: string) {
		if (!canWrite || busyId) return;
		busyId = id;
		error = null;
		try {
			// Sözleşme: PATCH /v1/incidents/:id/resolve (api.ts), POST değil.
			await apiSend(apiPaths.incidentResolve(id), 'PATCH');
			await refresh('incidents');
		} catch (err) {
			error = err instanceof Error ? err.message : t('incidents.resolveFailed');
		} finally {
			busyId = null;
		}
	}

	function incidentLabel(incident: Incident): string {
		return incident.incident_type_name;
	}
</script>

<div class="flex flex-col gap-2">
	{#if openIncidents.length > 0}
		<div class="rounded-[6px] border border-warning/40 bg-warning/10 px-3 py-2">
			<p class="mb-1.5 text-xs font-semibold text-warning">
				{t('contacts.timeline.openIncidents', { count: String(openIncidents.length) })}
			</p>
			<ul class="space-y-1">
				{#each openIncidents as incident (incident.id)}
					<li class="flex items-center justify-between gap-2 text-sm">
						<span class="min-w-0 truncate text-text">
							{incidentLabel(incident)}{incident.description ? ` — ${incident.description}` : ''}
						</span>
						{#if canWrite}
							<button
								type="button"
								class="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-border bg-surface px-2 py-0.5 text-xs text-text-muted transition-colors hover:text-text disabled:opacity-40"
								disabled={busyId === incident.id}
								onclick={() => void resolveIncident(incident.id)}
							>
								<Check class="size-3" />
								{busyId === incident.id ? t('incidents.resolving') : t('incidents.resolve')}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div
		class="flex flex-wrap items-center gap-1.5"
		role="group"
		aria-label={t('contacts.timeline.filterAria')}
	>
		{#each [{ id: 'all', label: t('contacts.timeline.filterAll') }, { id: 'incident', label: t('contacts.timeline.filterIncidents') }, { id: 'file', label: t('contacts.timeline.filterFiles') }] as chip (chip.id)}
			<button
				type="button"
				class="rounded-full border px-2.5 py-0.5 text-xs transition-colors {filter === chip.id
					? 'border-brand bg-brand/10 text-text'
					: 'border-border text-text-muted hover:text-text'}"
				aria-pressed={filter === chip.id}
				onclick={() => (filter = chip.id as Filter)}
			>
				{chip.label}
			</button>
		{/each}
	</div>

	<div
		bind:this={listEl}
		class="max-h-[28rem] min-h-24 space-y-2 overflow-y-auto rounded-[6px] border border-border bg-surface-2/40 p-2.5"
		role="log"
		aria-label={t('contacts.timeline.aria')}
	>
		{#if isPending}
			<p class="text-sm text-text-faint">{t('contacts.notes.loading')}</p>
		{:else if isError}
			<p class="text-sm text-danger">{t('contacts.notes.loadError')}</p>
		{:else if visibleItems.length === 0}
			<p class="text-sm text-text-faint">{t('contacts.timeline.empty')}</p>
		{:else}
			{#each visibleItems as item (item.kind + item.id)}
				<div class="rounded-[6px] border border-border bg-surface px-3 py-2 text-sm shadow-sm">
					<div
						class="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs text-text-faint"
					>
						<span class="flex min-w-0 items-center gap-1.5 font-medium text-text-muted">
							{#if item.kind === 'incident'}
								<AlertTriangle class="size-3.5 shrink-0 text-warning" aria-hidden="true" />
								<span class="truncate">{incidentLabel(item.incident)}</span>
							{:else if item.kind === 'file'}
								<Paperclip class="size-3.5 shrink-0" aria-hidden="true" />
								<span class="truncate">{item.file.uploaded_by_display_name ?? ''}</span>
							{:else}
								<span class="truncate">{item.note.author_display_name}</span>
							{/if}
						</span>
						<div class="flex shrink-0 items-center gap-1.5">
							<time datetime={item.at} class="tabular-nums">{formatDateTime(item.at)}</time>
							{#if item.kind === 'file'}
								<button
									type="button"
									class="rounded p-0.5 text-text-faint transition-colors hover:text-text"
									aria-label={t('contacts.files.previewAria')}
									title={t('contacts.files.previewAria')}
									onclick={() => void previewFile(item.file)}
								>
									<Eye class="size-3.5" />
								</button>
								<button
									type="button"
									class="rounded p-0.5 text-text-faint transition-colors hover:text-text"
									aria-label={t('contacts.files.downloadAria')}
									title={t('contacts.files.downloadAria')}
									onclick={() => void downloadFile(item.file)}
								>
									<Download class="size-3.5" />
								</button>
							{/if}
							{#if canWrite && item.kind !== 'incident'}
								<button
									type="button"
									class="rounded p-0.5 text-text-faint transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-40"
									aria-label={t('contacts.notes.deleteAria')}
									title={t('contacts.notes.deleteAria')}
									disabled={busyId === item.id}
									onclick={() =>
										item.kind === 'note' ? void removeNote(item.id) : void removeFile(item.file)}
								>
									<Trash2 class="size-3.5" />
								</button>
							{/if}
						</div>
					</div>

					{#if item.kind === 'note'}
						<p class="mt-1.5 whitespace-pre-wrap text-text">{item.note.body}</p>
					{:else if item.kind === 'incident'}
						<p class="mt-1.5 whitespace-pre-wrap text-text">
							{item.incident.description ?? ''}
						</p>
						<p class="mt-1 text-xs text-text-faint">
							{item.incident.status === 'open'
								? t('contacts.timeline.statusOpen')
								: t('contacts.timeline.statusResolved')}
						</p>
					{:else}
						<p class="mt-1.5 break-all text-text">{item.file.filename}</p>
						<p class="mt-0.5 text-xs text-text-faint">
							{formatBytes(item.file.size_bytes)}{item.file.appointment_label
								? ` · ${item.file.appointment_label}`
								: ''}
						</p>
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	{#if canWrite}
		<div class="flex flex-col gap-1.5">
			{#if asIncident}
				<div class="flex flex-wrap items-center gap-1.5">
					{#if incidentTypes.length === 0}
						<p class="text-xs text-text-faint">{t('incidents.form.noTypes')}</p>
					{:else}
						{#each incidentTypes as type (type.id)}
							<button
								type="button"
								class="rounded-full border px-2.5 py-0.5 text-xs transition-colors {incidentTypeId ===
								type.id
									? 'border-warning bg-warning/10 text-text'
									: 'border-border text-text-muted hover:text-text'}"
								aria-pressed={incidentTypeId === type.id}
								onclick={() => (incidentTypeId = type.id)}
							>
								{type.name}
							</button>
						{/each}
					{/if}
				</div>
			{/if}

			{#if appointments.length > 0}
				<select
					class="h-8 w-full rounded-[6px] border border-border bg-surface px-2 text-xs text-text-muted outline-none sm:max-w-xs"
					bind:value={linkAppointmentId}
					aria-label={t('contacts.files.linkAppointment')}
				>
					<option value="">{t('contacts.files.noAppointment')}</option>
					{#each appointments as appt (appt.id)}
						<option value={appt.id}>
							{formatDateTime(appt.starts_at)}
							{appt.title ? ` · ${appt.title}` : ''}
						</option>
					{/each}
				</select>
			{/if}

			<div class="flex items-end gap-2">
				<input
					bind:this={fileInput}
					type="file"
					class="hidden"
					onchange={onFilePicked}
					aria-hidden="true"
					tabindex="-1"
				/>
				<button
					type="button"
					class="inline-flex size-9 shrink-0 items-center justify-center rounded-[6px] border border-border text-text-muted transition-colors hover:text-text disabled:opacity-40"
					aria-label={t('contacts.timeline.attach')}
					title={t('contacts.timeline.attach')}
					disabled={uploading || sending}
					onclick={() => fileInput?.click()}
				>
					<Plus class="size-4" />
				</button>
				<button
					type="button"
					class="inline-flex size-9 shrink-0 items-center justify-center rounded-[6px] border transition-colors disabled:opacity-40 {asIncident
						? 'border-warning bg-warning/10 text-warning'
						: 'border-border text-text-muted hover:text-text'}"
					aria-label={t('contacts.timeline.markIncident')}
					title={t('contacts.timeline.markIncident')}
					aria-pressed={asIncident}
					disabled={uploading || sending}
					onclick={() => (asIncident = !asIncident)}
				>
					<AlertTriangle class="size-4" />
				</button>
				<input
					class="h-9 min-w-0 flex-1 rounded-[6px] border border-border bg-surface px-3 text-base text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40 sm:text-sm"
					placeholder={asIncident
						? t('contacts.timeline.incidentPlaceholder')
						: t('contacts.timeline.placeholder')}
					bind:value={draft}
					disabled={sending || uploading}
					onkeydown={onKeydown}
				/>
				<button
					type="button"
					class="inline-flex size-9 shrink-0 items-center justify-center rounded-[6px] bg-brand text-primary-foreground disabled:opacity-40"
					aria-label={t('contacts.notes.sendAria')}
					disabled={sending || uploading || !draft.trim()}
					onclick={() => void send()}
				>
					<ArrowUp class="size-4" />
				</button>
			</div>
		</div>
	{/if}

	{#if uploading}
		<p class="text-xs text-text-faint" aria-live="polite">
			{uploadProgress == null
				? t('contacts.files.uploading')
				: t('contacts.files.uploadingProgress', { progress: String(uploadProgress) })}
		</p>
	{/if}
	{#if error}
		<p class="text-xs text-danger">{error}</p>
	{/if}
</div>

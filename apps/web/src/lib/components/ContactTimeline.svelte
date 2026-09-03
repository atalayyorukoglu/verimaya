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
		appointmentStatusLabels,
		type Appointment,
		type ContactCaseNote,
		type ContactFile,
		type ContactFilePresignResponse,
		type Incident,
		type IncidentType,
		type Transaction
	} from '@verimaya/shared';
	import { apiGet, apiSend, listUrl, resolveApiUrl } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import {
		formatBytes,
		formatDateTime,
		formatMoney,
		formatRelativeTime,
		initialsOf
	} from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import AlertTriangle from '@lucide/svelte/icons/triangle-alert';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Check from '@lucide/svelte/icons/check';
	import Download from '@lucide/svelte/icons/download';
	import Eye from '@lucide/svelte/icons/eye';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Plus from '@lucide/svelte/icons/plus';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Pencil from '@lucide/svelte/icons/pencil';

	let {
		contactId,
		appointments = [],
		transactions = [],
		canWrite = true,
		onNewAppointment,
		onNewTransaction,
		onNewIncident,
		onEditAppointment,
		onEditTransaction
	}: {
		contactId: string;
		appointments?: Appointment[];
		transactions?: Transaction[];
		canWrite?: boolean;
		onNewAppointment?: () => void;
		onNewTransaction?: () => void;
		onNewIncident?: () => void;
		onEditAppointment?: (appointment: Appointment) => void;
		onEditTransaction?: (transaction: Transaction) => void;
	} = $props();

	let addMenuOpen = $state(false);
	function runAdd(action: (() => void) | undefined) {
		addMenuOpen = false;
		action?.();
	}

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
		| { kind: 'incident'; id: string; at: string; incident: Incident }
		| { kind: 'appointment'; id: string; at: string; appointment: Appointment }
		| { kind: 'transaction'; id: string; at: string; transaction: Transaction };

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
			})),
			/*
			 * Randevu ve işlem, kaydedildikleri an değil OLDUKLARI an ile sıralanır
			 * (`starts_at` / `occurred_on`) — hasta geçmişini okurken anlamlı olan bu.
			 * `occurred_on` saatsiz bir tarih; aynı güne düşen saatli kayıtlardan önce
			 * gelir, kabul edilebilir.
			 */
			...appointments.map((appointment): TimelineItem => ({
				kind: 'appointment',
				id: appointment.id,
				at: appointment.starts_at,
				appointment
			})),
			...transactions.map((transaction): TimelineItem => ({
				kind: 'transaction',
				id: transaction.id,
				at: transaction.occurred_on,
				transaction
			}))
		];
		return merged.sort((a, b) => a.at.localeCompare(b.at));
	});

	type Filter = 'all' | 'incident' | 'file' | 'appointment' | 'transaction';
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
	/*
	 * Yazma alanı "etkin" mi — ikincil kontroller (randevu bağı) buna göre görünür.
	 * Odak kaybında hemen kapatılmıyor: randevu seçicisine tıklamak girişten odağı
	 * alır ve satır kapanırsa tıklama boşa düşerdi. Kısa gecikme geçişe izin verir;
	 * seçici de aynı işleyicileri kullandığı için odak orada kaldığı sürece açık kalır.
	 */
	let composerFocused = $state(false);
	let composerBlurTimer: ReturnType<typeof setTimeout> | undefined;
	function onComposerFocus() {
		clearTimeout(composerBlurTimer);
		composerFocused = true;
	}
	function onComposerBlur() {
		clearTimeout(composerBlurTimer);
		composerBlurTimer = setTimeout(() => (composerFocused = false), 150);
	}
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

	<!-- Tek satır, yatay kaydırmalı: mobilde beş çip iki satıra taşıp dikey alan yiyordu. -->
	<div
		class="-mx-0.5 flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5 [&::-webkit-scrollbar]:hidden"
		role="group"
		aria-label={t('contacts.timeline.filterAria')}
	>
		{#each [{ id: 'all', label: t('contacts.timeline.filterAll') }, { id: 'appointment', label: t('contacts.timeline.filterAppointments') }, { id: 'transaction', label: t('contacts.timeline.filterTransactions') }, { id: 'incident', label: t('contacts.timeline.filterIncidents') }, { id: 'file', label: t('contacts.timeline.filterFiles') }] as chip (chip.id)}
			<button
				type="button"
				class="shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors {filter ===
				chip.id
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
		class="max-h-[28rem] min-h-24 space-y-0.5 overflow-y-auto rounded-[6px] border border-border bg-surface-2/30 p-1.5"
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
				<!--
					Satır kutusuz: avatar + kalın ad + göreli zaman + gövde. Her kaydı
					çerçeveye almak uzun akışta gürültü yapıyordu; eylemler yalnız üzerine
					gelince (ve klavye odağında) çıkar.
				-->
				<div
					class="group flex gap-2.5 rounded-[6px] px-1.5 py-1.5 transition-colors hover:bg-surface"
				>
					<div
						class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold {item.kind ===
						'incident'
							? 'bg-warning/15 text-warning'
							: item.kind === 'appointment'
								? 'bg-info/15 text-info'
								: item.kind === 'transaction'
									? 'bg-success/15 text-success'
									: item.kind === 'file'
										? 'bg-surface-2 text-text-muted'
										: 'bg-brand/15 text-brand'}"
						aria-hidden="true"
					>
						{#if item.kind === 'incident'}
							<AlertTriangle class="size-3.5" />
						{:else if item.kind === 'appointment'}
							<Calendar class="size-3.5" />
						{:else if item.kind === 'transaction'}
							<Wallet class="size-3.5" />
						{:else if item.kind === 'file'}
							<Paperclip class="size-3.5" />
						{:else}
							{initialsOf(item.note.author_display_name)}
						{/if}
					</div>

					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
							<span class="truncate text-sm font-semibold text-text">
								{#if item.kind === 'incident'}
									{incidentLabel(item.incident)}
								{:else if item.kind === 'appointment'}
									{item.appointment.appointment_type ||
										item.appointment.title ||
										t('contacts.timeline.filterAppointments')}
								{:else if item.kind === 'transaction'}
									{item.transaction.title ||
										item.transaction.category ||
										t('contacts.timeline.filterTransactions')}
								{:else if item.kind === 'file'}
									{item.file.uploaded_by_display_name || t('contacts.timeline.filterFiles')}
								{:else}
									{item.note.author_display_name}
								{/if}
							</span>
							<time
								datetime={item.at}
								title={formatDateTime(item.at)}
								class="text-xs text-text-faint">{formatRelativeTime(item.at)}</time
							>
							{#if item.kind === 'incident'}
								<span
									class="rounded-full px-1.5 py-px text-[10px] font-medium {item.incident.status ===
									'open'
										? 'bg-warning/15 text-warning'
										: 'bg-surface-2 text-text-faint'}"
								>
									{item.incident.status === 'open'
										? t('contacts.timeline.statusOpen')
										: t('contacts.timeline.statusResolved')}
								</span>
							{:else if item.kind === 'appointment'}
								<span class="rounded-full bg-surface-2 px-1.5 py-px text-[10px] text-text-faint">
									{appointmentStatusLabels[item.appointment.status]}
								</span>
							{:else if item.kind === 'transaction'}
								<span
									class="text-xs font-medium {item.transaction.kind === 'income'
										? 'text-success'
										: 'text-text-muted'}"
								>
									{item.transaction.kind === 'income' ? '+' : '−'}{formatMoney(
										item.transaction.amount,
										item.transaction.currency
									)}
								</span>
							{/if}
						</div>

						{#if item.kind === 'note'}
							<p class="mt-0.5 text-sm whitespace-pre-wrap text-text">{item.note.body}</p>
						{:else if item.kind === 'incident'}
							{#if item.incident.description}
								<p class="mt-0.5 text-sm whitespace-pre-wrap text-text">
									{item.incident.description}
								</p>
							{/if}
						{:else if item.kind === 'appointment'}
							<p class="mt-0.5 text-xs text-text-faint">
								{formatDateTime(item.appointment.starts_at)}{item.appointment.clinic_name
									? ` · ${item.appointment.clinic_name}`
									: ''}{item.appointment.hotel_name ? ` · ${item.appointment.hotel_name}` : ''}
							</p>
						{:else if item.kind === 'transaction'}
							<p class="mt-0.5 text-xs text-text-faint">
								{item.transaction.category ?? ''}{item.transaction.subtitle
									? ` · ${item.transaction.subtitle}`
									: ''}
							</p>
						{:else}
							<p class="mt-0.5 text-sm break-all text-text">{item.file.filename}</p>
							<p class="text-xs text-text-faint">
								{formatBytes(item.file.size_bytes)}{item.file.appointment_label
									? ` · ${item.file.appointment_label}`
									: ''}
							</p>
						{/if}
					</div>

					<div
						class="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
					>
						{#if item.kind === 'file'}
							<button
								type="button"
								class="rounded p-1 text-text-faint transition-colors hover:text-text"
								aria-label={t('contacts.files.previewAria')}
								title={t('contacts.files.previewAria')}
								onclick={() => void previewFile(item.file)}
							>
								<Eye class="size-3.5" />
							</button>
							<button
								type="button"
								class="rounded p-1 text-text-faint transition-colors hover:text-text"
								aria-label={t('contacts.files.downloadAria')}
								title={t('contacts.files.downloadAria')}
								onclick={() => void downloadFile(item.file)}
							>
								<Download class="size-3.5" />
							</button>
						{/if}
						{#if canWrite && item.kind === 'incident' && item.incident.status === 'open'}
							<button
								type="button"
								class="rounded p-1 text-text-faint transition-colors hover:text-text disabled:opacity-40"
								aria-label={t('incidents.resolve')}
								title={t('incidents.resolve')}
								disabled={busyId === item.id}
								onclick={() => void resolveIncident(item.id)}
							>
								<Check class="size-3.5" />
							</button>
						{/if}
						{#if canWrite && item.kind === 'appointment' && onEditAppointment}
							<button
								type="button"
								class="rounded p-1 text-text-faint transition-colors hover:text-text"
								aria-label={t('common.edit')}
								title={t('common.edit')}
								onclick={() => onEditAppointment?.(item.appointment)}
							>
								<Pencil class="size-3.5" />
							</button>
						{/if}
						{#if canWrite && item.kind === 'transaction' && onEditTransaction}
							<button
								type="button"
								class="rounded p-1 text-text-faint transition-colors hover:text-text"
								aria-label={t('common.edit')}
								title={t('common.edit')}
								onclick={() => onEditTransaction?.(item.transaction)}
							>
								<Pencil class="size-3.5" />
							</button>
						{/if}
						{#if canWrite && (item.kind === 'note' || item.kind === 'file')}
							<button
								type="button"
								class="rounded p-1 text-text-faint transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-40"
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

			<!--
				Randevu bağı yalnız yazarken görünür (Twist'in "Tag" satırı gibi): mobilde
				her zaman duran tam genişlikte bir açılır liste, kısıtlı dikey alanı
				yazma alanından çalıyordu.
			-->
			{#if appointments.length > 0 && (composerFocused || asIncident || draft.trim().length > 0)}
				<select
					class="h-8 w-full rounded-[6px] border border-border bg-surface px-2 text-xs text-text-muted outline-none sm:max-w-xs"
					bind:value={linkAppointmentId}
					aria-label={t('contacts.files.linkAppointment')}
					onfocus={onComposerFocus}
					onblur={onComposerBlur}
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

			<!--
				Yazma satırı: [+ Ekle ▾] [⚠] [ geniş giriş ] [gönder].
				"+ Ekle" başlıktan buraya indi (kullanıcı) — hem tek satır kazanıldı hem
				ekleme eylemi yazma alanının yanında. Giriş alanı belirgin: dolgulu zemin,
				yuvarlak hap, tam yükseklik; mobilde en geniş öğe o.
			-->
			<div class="flex items-center gap-1.5">
				<input
					bind:this={fileInput}
					type="file"
					class="hidden"
					onchange={onFilePicked}
					aria-hidden="true"
					tabindex="-1"
				/>
				<div class="relative shrink-0">
					<button
						type="button"
						class="inline-flex h-10 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-medium text-text-muted transition-colors hover:text-text disabled:opacity-40 sm:px-3"
						aria-haspopup="menu"
						aria-expanded={addMenuOpen}
						aria-label={t('contacts.timeline.add')}
						disabled={uploading || sending}
						onclick={() => (addMenuOpen = !addMenuOpen)}
					>
						<Plus class="size-4" />
						<span class="hidden sm:inline">{t('contacts.timeline.add')}</span>
					</button>
					{#if addMenuOpen}
						<!-- Dışarı tıklayınca kapanır; menü kendi tıklamasını yutar. -->
						<button
							type="button"
							class="fixed inset-0 z-10 cursor-default"
							aria-label={t('common.close')}
							onclick={() => (addMenuOpen = false)}
						></button>
						<div
							class="absolute bottom-full left-0 z-20 mb-1 min-w-44 rounded-[6px] border border-border bg-surface p-1 shadow-lg"
							role="menu"
						>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-sm text-text transition-colors hover:bg-surface-2"
								onclick={() => runAdd(onNewAppointment)}
							>
								<Calendar class="size-3.5 text-text-faint" />
								{t('contacts.timeline.addAppointment')}
							</button>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-sm text-text transition-colors hover:bg-surface-2"
								onclick={() => runAdd(onNewTransaction)}
							>
								<Wallet class="size-3.5 text-text-faint" />
								{t('contacts.timeline.addTransaction')}
							</button>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-sm text-text transition-colors hover:bg-surface-2"
								onclick={() => runAdd(() => fileInput?.click())}
							>
								<Paperclip class="size-3.5 text-text-faint" />
								{t('contacts.timeline.addFile')}
							</button>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-sm text-text transition-colors hover:bg-surface-2"
								onclick={() => runAdd(onNewIncident)}
							>
								<AlertTriangle class="size-3.5 text-text-faint" />
								{t('contacts.timeline.addIncident')}
							</button>
						</div>
					{/if}
				</div>
				<button
					type="button"
					class="inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40 {asIncident
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
					class="h-10 min-w-0 flex-1 rounded-full border border-border bg-surface-2 px-4 text-base text-text outline-none placeholder:text-text-faint focus:border-brand focus:ring-2 focus:ring-brand/30 sm:text-sm"
					placeholder={asIncident
						? t('contacts.timeline.incidentPlaceholder')
						: t('contacts.timeline.placeholder')}
					bind:value={draft}
					disabled={sending || uploading}
					onkeydown={onKeydown}
					onfocus={onComposerFocus}
					onblur={onComposerBlur}
				/>
				<button
					type="button"
					class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-primary-foreground disabled:opacity-40"
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

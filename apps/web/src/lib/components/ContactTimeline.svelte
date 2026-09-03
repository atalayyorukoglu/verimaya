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
	 *
	 * 2026-09-03 tasarım turu (kullanıcı mockup'ı): sol dikey ray + tip renkli yuvarlak
	 * ikon, güne göre gruplama (Bugün / Dün / 2 Mayıs 2025) yapışkan başlıkla, dosyalar
	 * ayrı kart, çiplerde sayı, tek "+" menüsü. Renkler `layout.css`'teki `--tl-*`
	 * tokenlarından gelir (ham hex yok, koyu temada ayrı değerler).
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
		formatTime,
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

	/** Kayıtlar tek listede toplanır; sıralama aşağıda (en yeni üstte). */
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
		// En yeni üstte (tasarım kararı, 2026-09-03): hasta kartı açılınca son durum görünür.
		return merged.sort((a, b) => b.at.localeCompare(a.at));
	});

	/** Tip → renk tokeni + ikon zemini. Renk "bu kayıt ne" demek, "iyi/kötü" değil. */
	const TYPE_STYLE: Record<TimelineItem['kind'], string> = {
		appointment: 'bg-tl-appointment-soft text-tl-appointment',
		transaction: 'bg-tl-transaction-soft text-tl-transaction',
		note: 'bg-tl-note-soft text-tl-note',
		file: 'bg-tl-file-soft text-tl-file',
		incident: 'bg-tl-incident-soft text-tl-incident'
	};

	function dayKey(iso: string): string {
		return new Date(iso).toLocaleDateString('en-CA');
	}

	/** "Bugün" / "Dün" / "2 Mayıs 2025" — grup başlığı. */
	function dayLabel(iso: string): string {
		const key = dayKey(iso);
		const today = new Date();
		if (key === dayKey(today.toISOString())) return t('contacts.timeline.today');
		const yesterday = new Date(today.getTime() - 86_400_000);
		if (key === dayKey(yesterday.toISOString())) return t('contacts.timeline.yesterday');
		return new Intl.DateTimeFormat('tr-TR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		}).format(new Date(iso));
	}

	/** Satırda ya saat ya da "10 dk önce" — aynı gün içindekiler göreli okunur. */
	function rowTime(iso: string): string {
		const age = Date.now() - new Date(iso).getTime();
		if (age < 86_400_000) return formatRelativeTime(iso);
		return formatTime(iso);
	}

	type DayGroup = { key: string; label: string; items: TimelineItem[] };
	const groups = $derived.by((): DayGroup[] => {
		const out: DayGroup[] = [];
		for (const item of visibleItems) {
			const key = dayKey(item.at);
			const last = out[out.length - 1];
			if (last && last.key === key) last.items.push(item);
			else out.push({ key, label: dayLabel(item.at), items: [item] });
		}
		return out;
	});

	/** Filtre çiplerindeki sayılar. */
	const counts = $derived({
		all: items.length,
		appointment: items.filter((i) => i.kind === 'appointment').length,
		transaction: items.filter((i) => i.kind === 'transaction').length,
		incident: items.filter((i) => i.kind === 'incident').length,
		file: items.filter((i) => i.kind === 'file').length,
		note: items.filter((i) => i.kind === 'note').length
	});

	type Filter = 'all' | 'incident' | 'file' | 'appointment' | 'transaction' | 'note';
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
	let composerInput: HTMLInputElement | undefined = $state();

	/** Dosya kartındaki tip rozeti: PNG / PDF / JPG… */
	function fileKindLabel(file: ContactFile): string {
		const fromName = file.filename.split('.').pop();
		if (fromName && fromName.length <= 4 && /^[a-z0-9]+$/i.test(fromName)) {
			return fromName.toUpperCase();
		}
		const sub = file.mime_type?.split('/').pop();
		return (sub ?? 'DOSYA').slice(0, 4).toUpperCase();
	}

	/** Son kullanılan tür hatırlanır; olay işaretlemek çoğu zaman tek tık kalsın. */
	$effect(() => {
		if (!incidentTypeId && incidentTypes.length > 0) incidentTypeId = incidentTypes[0]!.id;
	});

	/** Yeni kayıt en üste düşüyor (liste yeniden eskiye), oraya kaydır. */
	function scrollToNewest() {
		if (listEl) listEl.scrollTop = 0;
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
			requestAnimationFrame(() => requestAnimationFrame(scrollToNewest));
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
			requestAnimationFrame(() => requestAnimationFrame(scrollToNewest));
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

<!--
	Zaman çizgisi: solda ince dikey ray, her satırda yuvarlak tip ikonu.
	Kayıtlar güne göre gruplanır (Bugün / Dün / 2 Mayıs 2025), grup başlığı yapışkan.
	En yeni üstte: hasta kartı açılınca son durum ilk görünür.
-->
<div class="flex flex-col gap-3">
	{#if openIncidents.length > 0}
		<!-- Açık olay uyarısı: sol kalın sarı kenar; mobilde "Çözüldü" tam genişlikte alta iner. -->
		<div
			class="rounded-[8px] border border-l-4 border-tl-incident/35 border-l-tl-incident bg-tl-incident-soft px-3 py-2.5"
		>
			<div class="flex items-start gap-2.5">
				<span
					class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-tl-incident"
					aria-hidden="true"
				>
					<AlertTriangle class="size-3.5" />
				</span>
				<div class="min-w-0 flex-1">
					<p class="text-xs font-semibold text-tl-incident">
						{t('contacts.timeline.openIncidents', { count: String(openIncidents.length) })}
					</p>
					<ul class="mt-0.5 space-y-1.5">
						{#each openIncidents as incident (incident.id)}
							<li class="sm:flex sm:items-center sm:justify-between sm:gap-2">
								<span class="block truncate text-sm text-text">
									{incidentLabel(incident)}{incident.description
										? ` — ${incident.description}`
										: ''}
								</span>
								{#if canWrite}
									<button
										type="button"
										class="mt-1.5 w-full shrink-0 rounded-[6px] border border-border bg-surface px-2 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text disabled:opacity-40 sm:mt-0 sm:w-auto sm:py-0.5"
										disabled={busyId === incident.id}
										onclick={() => void resolveIncident(incident.id)}
									>
										{busyId === incident.id
											? t('incidents.resolving')
											: `✓ ${t('incidents.resolve')}`}
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	{/if}

	<!-- Çipler tek satır, yatay kaydırmalı; aktif olan koyu dolgu, her çipte sayı. -->
	<div
		class="-mx-0.5 flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5 [&::-webkit-scrollbar]:hidden"
		role="group"
		aria-label={t('contacts.timeline.filterAria')}
	>
		{#each [{ id: 'all', label: t('contacts.timeline.filterAll'), n: counts.all }, { id: 'appointment', label: t('contacts.timeline.filterAppointments'), n: counts.appointment }, { id: 'transaction', label: t('contacts.timeline.filterTransactions'), n: counts.transaction }, { id: 'incident', label: t('contacts.timeline.filterIncidents'), n: counts.incident }, { id: 'file', label: t('contacts.timeline.filterFiles'), n: counts.file }, { id: 'note', label: t('contacts.timeline.filterNotes'), n: counts.note }] as chip (chip.id)}
			<button
				type="button"
				class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors {filter ===
				chip.id
					? 'border-text bg-text text-surface'
					: 'border-border text-text-muted hover:text-text'}"
				aria-pressed={filter === chip.id}
				onclick={() => (filter = chip.id as Filter)}
			>
				{chip.label}
				{#if chip.id !== 'all'}
					<span class="tabular-nums opacity-70">{chip.n}</span>
				{/if}
			</button>
		{/each}
	</div>

	<div
		bind:this={listEl}
		class="max-h-[28rem] min-h-24 overflow-y-auto"
		role="log"
		aria-label={t('contacts.timeline.aria')}
	>
		{#if isPending}
			<p class="text-sm text-text-faint">{t('contacts.notes.loading')}</p>
		{:else if isError}
			<p class="text-sm text-danger">{t('contacts.notes.loadError')}</p>
		{:else if groups.length === 0}
			<p class="text-sm text-text-faint">{t('contacts.timeline.empty')}</p>
		{:else}
			{#each groups as group (group.key)}
				<h3 class="sticky top-0 z-10 bg-surface py-1.5 text-xs font-semibold text-text-muted">
					{group.label}
				</h3>
				<ul class="space-y-4">
					{#each group.items as item (item.kind + item.id)}
						<!-- Satır: solda tip renkli yuvarlak, sağda ad + zaman ve gövde balonu. -->
						<li class="relative flex gap-3 max-[480px]:gap-2.5">
							<span
								class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full max-[480px]:size-7 {TYPE_STYLE[
									item.kind
								]}"
								aria-hidden="true"
							>
								{#if item.kind === 'incident'}
									<AlertTriangle class="size-4 max-[480px]:size-3.5" />
								{:else if item.kind === 'appointment'}
									<Calendar class="size-4 max-[480px]:size-3.5" />
								{:else if item.kind === 'transaction'}
									<Wallet class="size-4 max-[480px]:size-3.5" />
								{:else if item.kind === 'file'}
									<Paperclip class="size-4 max-[480px]:size-3.5" />
								{:else}
									<span class="text-[11px] font-semibold"
										>{initialsOf(item.note.author_display_name)}</span
									>
								{/if}
							</span>

							<div class="group min-w-0 flex-1">
								<!-- Başlık satırı; dar ekranda zaman alta iner. -->
								<div
									class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 max-[480px]:flex-col max-[480px]:items-start"
								>
									<span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
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

										{#if item.kind === 'file'}
											<span class="text-xs text-text-muted">{t('contacts.timeline.fileAdded')}</span
											>
										{:else if item.kind === 'incident'}
											<span
												class="rounded-full px-1.5 py-px text-[10px] font-medium {item.incident
													.status === 'open'
													? 'bg-tl-incident-soft text-tl-incident'
													: 'bg-surface-2 text-text-faint'}"
											>
												{item.incident.status === 'open'
													? t('contacts.timeline.statusOpen')
													: t('contacts.timeline.statusResolved')}
											</span>
										{:else if item.kind === 'appointment'}
											<span
												class="rounded-full bg-tl-appointment-soft px-1.5 py-px text-[10px] font-medium text-tl-appointment"
											>
												{appointmentStatusLabels[item.appointment.status]}
											</span>
										{:else if item.kind === 'transaction'}
											<span
												class="text-sm font-semibold {item.transaction.kind === 'income'
													? 'text-tl-transaction'
													: 'text-danger'}"
											>
												{item.transaction.kind === 'income' ? '+' : '−'}{formatMoney(
													item.transaction.amount,
													item.transaction.currency
												)}
											</span>
										{/if}
									</span>

									<time
										datetime={item.at}
										title={formatDateTime(item.at)}
										class="shrink-0 text-xs text-text-faint">{rowTime(item.at)}</time
									>
								</div>

								{#if item.kind === 'note'}
									<p
										class="mt-1 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap text-text"
									>
										{item.note.body}
									</p>
								{:else if item.kind === 'incident'}
									{#if item.incident.description}
										<p
											class="mt-1 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap text-text"
										>
											{item.incident.description}
										</p>
									{/if}
								{:else if item.kind === 'appointment'}
									<p class="mt-0.5 text-sm text-text-muted">
										{formatTime(item.appointment.starts_at)}{item.appointment.clinic_name
											? ` · ${item.appointment.clinic_name}`
											: ''}{item.appointment.hotel_name ? ` · ${item.appointment.hotel_name}` : ''}
									</p>
								{:else if item.kind === 'transaction'}
									<p class="mt-0.5 text-sm text-text-muted">
										{item.transaction.category ?? ''}{item.transaction.subtitle
											? ` · ${item.transaction.subtitle}`
											: ''}
									</p>
								{:else}
									<!--
										Dosya eki ayrı kart. Mobilde üç ikon gizli: karta dokunmak önizlemeyi
										açar — 44px'lik hedefler dar ekranda yan yana sığmıyor.
									-->
									<div
										class="mt-1.5 flex items-center gap-2.5 rounded-[8px] border border-border bg-surface px-2.5 py-2"
									>
										<button
											type="button"
											class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
											aria-label={t('contacts.timeline.openFile')}
											onclick={() => void previewFile(item.file)}
										>
											<span
												class="flex size-9 shrink-0 items-center justify-center rounded-[6px] bg-tl-file-soft text-[10px] font-bold text-tl-file"
											>
												{fileKindLabel(item.file)}
											</span>
											<span class="min-w-0">
												<span class="block truncate text-sm text-text">{item.file.filename}</span>
												<span class="block text-xs text-text-faint"
													>{formatBytes(item.file.size_bytes)}{item.file.appointment_label
														? ` · ${item.file.appointment_label}`
														: ''}</span
												>
											</span>
										</button>
										<div class="hidden shrink-0 items-center gap-0.5 min-[481px]:flex">
											<button
												type="button"
												class="rounded p-1.5 text-text-faint transition-colors hover:text-text"
												aria-label={t('contacts.files.previewAria')}
												title={t('contacts.files.previewAria')}
												onclick={() => void previewFile(item.file)}
											>
												<Eye class="size-4" />
											</button>
											<button
												type="button"
												class="rounded p-1.5 text-text-faint transition-colors hover:text-text"
												aria-label={t('contacts.files.downloadAria')}
												title={t('contacts.files.downloadAria')}
												onclick={() => void downloadFile(item.file)}
											>
												<Download class="size-4" />
											</button>
											{#if canWrite}
												<button
													type="button"
													class="rounded p-1.5 text-text-faint transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-40"
													aria-label={t('contacts.notes.deleteAria')}
													title={t('contacts.notes.deleteAria')}
													disabled={busyId === item.id}
													onclick={() => void removeFile(item.file)}
												>
													<Trash2 class="size-4" />
												</button>
											{/if}
										</div>
									</div>
								{/if}
							</div>

							<!-- Satır eylemleri: yalnız üzerine gelince ve klavye odağında. -->
							{#if canWrite && item.kind !== 'file'}
								<div
									class="absolute top-0 right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-[480px]:opacity-100"
								>
									{#if item.kind === 'appointment' && onEditAppointment}
										<button
											type="button"
											class="rounded p-1 text-text-faint transition-colors hover:text-text"
											aria-label={t('common.edit')}
											title={t('common.edit')}
											onclick={() => onEditAppointment?.(item.appointment)}
										>
											<Pencil class="size-3.5" />
										</button>
									{:else if item.kind === 'transaction' && onEditTransaction}
										<button
											type="button"
											class="rounded p-1 text-text-faint transition-colors hover:text-text"
											aria-label={t('common.edit')}
											title={t('common.edit')}
											onclick={() => onEditTransaction?.(item.transaction)}
										>
											<Pencil class="size-3.5" />
										</button>
									{:else if item.kind === 'incident' && item.incident.status === 'open'}
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
									{:else if item.kind === 'note'}
										<button
											type="button"
											class="rounded p-1 text-text-faint transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-40"
											aria-label={t('contacts.notes.deleteAria')}
											title={t('contacts.notes.deleteAria')}
											disabled={busyId === item.id}
											onclick={() => void removeNote(item.id)}
										>
											<Trash2 class="size-3.5" />
										</button>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/each}
		{/if}
	</div>

	{#if canWrite}
		<!--
			Yazma alanı alta yapışık. Masaüstünde kaydıran kap `<main>`, mobilde belge;
			`sticky` ikisinde de doğru kaba tutunur. Mobilde alt menü `fixed` olduğu için
			onun yüksekliği kadar yukarıdan başlar, üstüne binmesin.
		-->
		<div
			class="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-1.5 border-t border-border bg-surface px-4 pt-3 pb-2 sm:-mx-5 sm:px-5 md:bottom-0"
		>
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
									? 'border-tl-incident bg-tl-incident-soft text-text'
									: 'border-border text-text-muted hover:text-text'}"
								aria-pressed={incidentTypeId === type.id}
								onclick={() => (incidentTypeId = type.id)}
							>
								{type.name}
							</button>
						{/each}
					{/if}
					{#if onNewIncident}
						<button
							type="button"
							class="ml-auto text-xs font-medium text-brand hover:underline"
							onclick={() => onNewIncident?.()}
						>
							{t('contacts.timeline.detailedIncident')}
						</button>
					{/if}
				</div>
			{/if}

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

			<!-- Tek "+" menüsü + geniş giriş + gönder. Ayrı ⚠ düğmesi kaldırıldı. -->
			<div class="flex items-center gap-2">
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
						class="inline-flex size-10 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:text-text disabled:opacity-40 max-[480px]:size-9"
						aria-haspopup="menu"
						aria-expanded={addMenuOpen}
						aria-label={t('contacts.timeline.add')}
						disabled={uploading || sending}
						onclick={() => (addMenuOpen = !addMenuOpen)}
					>
						<Plus class="size-4" />
					</button>
					{#if addMenuOpen}
						<button
							type="button"
							class="fixed inset-0 z-10 cursor-default"
							aria-label={t('common.close')}
							onclick={() => (addMenuOpen = false)}
						></button>
						<div
							class="absolute bottom-full left-0 z-20 mb-1 min-w-48 rounded-[8px] border border-border bg-surface p-1 shadow-lg"
							role="menu"
						>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm text-text transition-colors hover:bg-surface-2"
								onclick={() => runAdd(() => composerInput?.focus())}
							>
								<span
									class="flex size-6 items-center justify-center rounded-full bg-tl-note-soft text-tl-note"
								>
									<Pencil class="size-3" />
								</span>
								{t('contacts.timeline.addNote')}
							</button>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm text-text transition-colors hover:bg-surface-2"
								onclick={() => runAdd(() => fileInput?.click())}
							>
								<span
									class="flex size-6 items-center justify-center rounded-full bg-tl-file-soft text-tl-file"
								>
									<Paperclip class="size-3" />
								</span>
								{t('contacts.timeline.addFile')}
							</button>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm text-text transition-colors hover:bg-surface-2"
								onclick={() =>
									runAdd(() => {
										asIncident = true;
										composerInput?.focus();
									})}
							>
								<span
									class="flex size-6 items-center justify-center rounded-full bg-tl-incident-soft text-tl-incident"
								>
									<AlertTriangle class="size-3" />
								</span>
								{t('contacts.timeline.addIncident')}
							</button>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm text-text transition-colors hover:bg-surface-2"
								onclick={() => runAdd(onNewAppointment)}
							>
								<span
									class="flex size-6 items-center justify-center rounded-full bg-tl-appointment-soft text-tl-appointment"
								>
									<Calendar class="size-3" />
								</span>
								{t('contacts.timeline.addAppointment')}
							</button>
							<button
								type="button"
								role="menuitem"
								class="flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm text-text transition-colors hover:bg-surface-2"
								onclick={() => runAdd(onNewTransaction)}
							>
								<span
									class="flex size-6 items-center justify-center rounded-full bg-tl-transaction-soft text-tl-transaction"
								>
									<Wallet class="size-3" />
								</span>
								{t('contacts.timeline.addTransaction')}
							</button>
						</div>
					{/if}
				</div>
				<input
					bind:this={composerInput}
					class="h-10 min-w-0 flex-1 rounded-full border border-border bg-surface-2 px-4 text-base text-text outline-none placeholder:text-text-faint focus:border-brand focus:ring-2 focus:ring-brand/30 max-[480px]:h-9 sm:text-sm"
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
					class="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-primary-foreground disabled:opacity-40 max-[480px]:size-9"
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

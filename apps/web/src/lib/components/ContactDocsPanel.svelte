<script lang="ts">
	/*
	 * EVRAK-01 — Kişi › Dosyalar. WhatsApp'tan gelen evraklar VİZİTE ve TÜRE göre
	 * gruplanır: "1. vizit › Onam formu, X-ray (öncesi) …". Vizite bağlanamayanlar
	 * "Vizit belirsiz" grubunda durur — gizlenmez, çünkü orada duran bir evrak
	 * kontrol listesini işaretleyemiyor demektir ve kullanıcının düzeltmesi gerekir.
	 *
	 * Önizleme WhatsApp'ın mesajla gönderdiği küçük JPEG'dir (yanıtta geliyor, ek
	 * ayrıca indirilmiyor). Tıklayınca tam dosya çerezli fetch ile açılır.
	 *
	 * Dar ekranda tablo yok: her ek kendi satırında, alanlar sarıyor — 400px'te
	 * yatay taşma olmuyor.
	 */
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { ContactMedia, ContactVisit, MediaDocSubtype, MediaDocType } from '@verimaya/shared';
	import {
		apiPaths,
		contactVisitDateRangeLabel,
		contactVisitTypeLabels,
		mediaDocSubtypeLabels,
		mediaDocTypeLabels,
		mediaVisitHintLabels
	} from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDate } from '$lib/format';
	import { openInboundMediaByMessageId } from '$lib/whatsapp/media';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import FileText from '@lucide/svelte/icons/file-text';

	let { contactId }: { contactId: string } = $props();

	const qs = useQueryScope();
	const queryClient = useQueryClient();

	const mediaQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.media(contactId),
		queryFn: () => apiGet<{ items: ContactMedia[] }>(apiPaths.contactMedia(contactId)),
		enabled: qs.ready
	}));

	const visitsQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.visits(contactId),
		queryFn: () => apiGet<{ items: ContactVisit[] }>(apiPaths.contactVisits(contactId)),
		enabled: qs.ready
	}));

	const items = $derived(mediaQuery.data?.items ?? []);
	const visits = $derived(visitsQuery.data?.items ?? []);

	let editing = $state<ContactMedia | null>(null);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let formDocType = $state<string>('');
	let formSubtype = $state<string>('');
	let formVisitId = $state<string>('');

	const DOC_TYPES = Object.keys(mediaDocTypeLabels) as MediaDocType[];
	const SUBTYPES = Object.keys(mediaDocSubtypeLabels) as MediaDocSubtype[];

	function visitLabel(v: ContactVisit): string {
		return [contactVisitTypeLabels[v.visit_type], contactVisitDateRangeLabel(v)]
			.filter(Boolean)
			.join(' · ');
	}

	/** Vizit → tür → ekler. Sıra vizit listesinin sırası; belirsiz grup en sonda. */
	const gruplar = $derived.by(() => {
		const byVisit = new Map<string, ContactMedia[]>();
		for (const m of items) {
			const key = m.contact_visit_id ?? '';
			byVisit.set(key, [...(byVisit.get(key) ?? []), m]);
		}
		const out: Array<{
			key: string;
			label: string;
			turler: Array<{ label: string; ekler: ContactMedia[] }>;
		}> = [];
		const turlere = (list: ContactMedia[]) => {
			const byType = new Map<string, ContactMedia[]>();
			for (const m of list) {
				const key = m.doc_type && m.doc_type !== 'other' ? m.doc_type : '';
				byType.set(key, [...(byType.get(key) ?? []), m]);
			}
			return [...byType.entries()]
				.map(([key, ekler]) => ({
					label: key ? mediaDocTypeLabels[key as MediaDocType] : t('contacts.docs.unknownType'),
					ekler
				}))
				.sort((a, b) => a.label.localeCompare(b.label, 'tr'));
		};
		for (const v of visits) {
			const list = byVisit.get(v.id);
			if (!list?.length) continue;
			out.push({ key: v.id, label: visitLabel(v), turler: turlere(list) });
		}
		const bagsiz = byVisit.get('');
		if (bagsiz?.length) {
			out.push({ key: '', label: t('contacts.docs.unknownVisit'), turler: turlere(bagsiz) });
		}
		return out;
	});

	async function ac(m: ContactMedia) {
		error = null;
		try {
			await openInboundMediaByMessageId(m.inbound_message_id);
		} catch {
			error = t('contacts.docs.openFailed');
		}
	}

	function duzelt(m: ContactMedia) {
		editing = m;
		error = null;
		formDocType = m.doc_type ?? '';
		formSubtype = m.doc_subtype ?? '';
		formVisitId = m.contact_visit_id ?? '';
	}

	async function kaydet() {
		if (!editing || saving) return;
		saving = true;
		error = null;
		try {
			await apiSend(apiPaths.whatsappMedia(editing.id), 'PATCH', {
				doc_type: formDocType || null,
				doc_subtype: formDocType === 'consent_form' && formSubtype ? formSubtype : null,
				contact_visit_id: formVisitId || null
			});
			editing = null;
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.media(contactId) });
			// Kontrol listesi bu etikete bakıyor; özet de onu okuyor.
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.summary(contactId) });
		} catch (err) {
			error = err instanceof Error ? err.message : t('contacts.docs.saveFailed');
		} finally {
			saving = false;
		}
	}
</script>

<section class="mb-4">
	<div class="mb-3">
		<h2 class="text-sm font-semibold text-text">{t('contacts.docs.title')}</h2>
		<p class="text-xs text-text-faint">{t('contacts.docs.subtitle')}</p>
	</div>

	{#if error}
		<p class="mb-2 text-xs text-danger">{error}</p>
	{/if}

	{#if mediaQuery.isPending}
		<p class="text-sm text-text-muted">{t('contacts.docs.loading')}</p>
	{:else if mediaQuery.isError}
		<p class="text-sm text-danger">{t('contacts.docs.error')}</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-6 text-center">
			<p class="text-sm text-text-muted">{t('contacts.docs.empty')}</p>
		</div>
	{:else}
		<div class="space-y-4">
			{#each gruplar as grup (grup.key)}
				<div class="rounded-lg border border-border bg-surface p-3">
					<h3 class="text-xs font-semibold break-words text-text">{grup.label}</h3>
					<div class="mt-2 space-y-3">
						{#each grup.turler as tur (tur.label)}
							<div>
								<p class="text-[11px] font-medium text-text-muted">
									{tur.label}
									<span class="text-text-faint">({tur.ekler.length})</span>
								</p>
								<ul class="mt-1 space-y-1">
									{#each tur.ekler as m (m.id)}
										<li
											class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1.5"
										>
											<button
												type="button"
												class="flex min-w-0 flex-1 items-center gap-2 text-left"
												onclick={() => void ac(m)}
												title={t('contacts.docs.open')}
											>
												{#if m.thumbnail}
													<img
														src={m.thumbnail}
														alt=""
														class="size-9 shrink-0 rounded object-cover"
														loading="lazy"
													/>
												{:else}
													<span
														class="flex size-9 shrink-0 items-center justify-center rounded bg-surface text-text-faint"
													>
														<FileText class="size-4" aria-hidden="true" />
													</span>
												{/if}
												<span class="min-w-0">
													<span class="block truncate text-xs text-text">
														{m.caption || m.filename || t('contacts.docs.unknownType')}
													</span>
													<span class="block text-[11px] text-text-faint tabular-nums">
														{formatDate(m.created_at)}
														{#if m.doc_subtype}
															· {mediaDocSubtypeLabels[m.doc_subtype]}
														{/if}
														{#if m.visit_hint && !m.contact_visit_id}
															· {mediaVisitHintLabels[m.visit_hint]}
														{/if}
													</span>
												</span>
											</button>
											<button
												type="button"
												class="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-text-muted transition-colors hover:text-text"
												onclick={() => duzelt(m)}
											>
												{t('contacts.docs.edit')}
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>

{#if editing}
	<div class="mt-2 rounded-lg border border-brand/40 bg-surface p-3">
		<h3 class="text-xs font-semibold text-text">{t('contacts.docs.editTitle')}</h3>
		<div class="mt-2 grid gap-2 sm:grid-cols-3">
			<label class="block text-[11px] text-text-muted">
				{t('contacts.docs.docType')}
				<select
					bind:value={formDocType}
					class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-text"
				>
					<option value="">{t('contacts.docs.none')}</option>
					{#each DOC_TYPES as dt (dt)}
						<option value={dt}>{mediaDocTypeLabels[dt]}</option>
					{/each}
				</select>
			</label>
			{#if formDocType === 'consent_form'}
				<label class="block text-[11px] text-text-muted">
					{t('contacts.docs.docSubtype')}
					<select
						bind:value={formSubtype}
						class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-text"
					>
						<option value="">{t('contacts.docs.none')}</option>
						{#each SUBTYPES as st (st)}
							<option value={st}>{mediaDocSubtypeLabels[st]}</option>
						{/each}
					</select>
				</label>
			{/if}
			<label class="block text-[11px] text-text-muted">
				{t('contacts.docs.visit')}
				<select
					bind:value={formVisitId}
					class="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-text"
				>
					<option value="">{t('contacts.docs.unknownVisit')}</option>
					{#each visits as v (v.id)}
						<option value={v.id}>{visitLabel(v)}</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="mt-2 flex flex-wrap gap-2">
			<Button type="button" size="sm" disabled={saving} onclick={() => void kaydet()}>
				{saving ? t('contacts.docs.saving') : t('contacts.docs.save')}
			</Button>
			<Button type="button" size="sm" variant="secondary" onclick={() => (editing = null)}>
				{t('contacts.docs.cancel')}
			</Button>
		</div>
	</div>
{/if}

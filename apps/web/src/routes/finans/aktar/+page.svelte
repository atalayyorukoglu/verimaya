<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import type {
		InboundMessage,
		Patient,
		TransactionCreate,
		TransactionDraft
	} from '@verimaya/shared';
	import { apiPaths, inboundMessageStatusLabels } from '@verimaya/shared';
	import { apiGet, apiSend, listUrl } from '$lib/api';
	import { formatDateTime } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import TransactionDraftCard from '$lib/components/TransactionDraftCard.svelte';
	import { Button } from '$lib/components/ui/button';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	type PatientsPage = { items: Patient[]; next_cursor: string | null };
	type DraftState = TransactionDraft & {
		_status: 'idle' | 'saving' | 'saved' | 'error';
		_error: string | null;
	};

	const PLACEHOLDER =
		'Örnek:\nSandra 2900 GBP 2. vizit ödemesi + 450 GBP t-base ücretleri alındı.\nToplamda 3.350 GBP kart ile ödeme alındı.';

	const queryClient = useQueryClient();
	let message = $state('');
	let parsing = $state(false);
	let parseError = $state<string | null>(null);
	let processing = $state(false);
	let drafts = $state<DraftState[]>([]);
	let activeInboxId = $state<string | null>(null);
	let showLongWarning = $state(false);

	const inboxQuery = createQuery(() => ({
		queryKey: ['whatsapp', 'inbox'],
		queryFn: () => apiGet<{ messages: InboundMessage[] }>(apiPaths.whatsappInbox)
	}));

	const patientsQuery = createQuery(() => ({
		queryKey: ['patients', { limit: 100, for: 'whatsapp' }],
		queryFn: () => apiGet<PatientsPage>(listUrl('patients', { limit: 100 }))
	}));

	const patients = $derived(patientsQuery.data?.items ?? []);
	const pendingMessages = $derived(
		(inboxQuery.data?.messages ?? []).filter((m) => m.status === 'new' || m.status === 'parsed')
	);
	const pendingCount = $derived(pendingMessages.filter((m) => m.status === 'new').length);

	function initDrafts(records: TransactionDraft[]): DraftState[] {
		return records.map((r) => ({ ...r, _status: 'idle', _error: null }));
	}

	$effect(() => {
		const inboxId = page.url.searchParams.get('inbox');
		if (!inboxId || inboxId === activeInboxId) return;
		const item = pendingMessages.find((m) => m.id === inboxId);
		if (!item) return;
		activeInboxId = inboxId;
		message = item.body ?? '';
		if (item.parsed_records && item.parsed_records.length > 0) {
			drafts = initDrafts(item.parsed_records);
		} else {
			drafts = [];
		}
	});

	async function analyzeText(text: string) {
		parsing = true;
		parseError = null;
		try {
			const res = await apiSend<{ records: TransactionDraft[] }>(apiPaths.whatsappParse, 'POST', {
				message: text
			});
			drafts = initDrafts(res.records);
			if (res.records.length === 0) parseError = 'Mesajdan işlem çıkarılamadı.';
		} catch (err) {
			parseError = err instanceof Error ? err.message : 'Analiz başarısız';
			drafts = [];
		} finally {
			parsing = false;
		}
	}

	function requestAnalyze() {
		if (!message.trim()) return;
		if (message.length > 600) {
			showLongWarning = true;
			return;
		}
		activeInboxId = null;
		void analyzeText(message);
	}

	async function analyzeInboxItem(item: InboundMessage) {
		activeInboxId = item.id;
		message = item.body ?? '';
		parsing = true;
		parseError = null;
		try {
			const res = await apiSend<{ records: TransactionDraft[] }>(
				apiPaths.whatsappInboxParse(item.id),
				'POST'
			);
			drafts = initDrafts(res.records);
			if (res.records.length === 0) {
				parseError = item.has_media ? 'Medya mesajı — metin yok.' : 'Mesajdan işlem çıkarılamadı.';
			}
			await queryClient.invalidateQueries({ queryKey: ['whatsapp', 'inbox'] });
		} catch (err) {
			parseError = err instanceof Error ? err.message : 'Analiz başarısız';
			drafts = [];
		} finally {
			parsing = false;
		}
	}

	async function processNewMessages() {
		processing = true;
		try {
			await apiSend(apiPaths.whatsappInboxProcess, 'POST');
			await queryClient.invalidateQueries({ queryKey: ['whatsapp', 'inbox'] });
		} finally {
			processing = false;
		}
	}

	async function ignoreInbox(id: string) {
		await apiSend(apiPaths.whatsappInboxIgnore(id), 'POST');
		if (activeInboxId === id) {
			activeInboxId = null;
			message = '';
			drafts = [];
		}
		await queryClient.invalidateQueries({ queryKey: ['whatsapp', 'inbox'] });
	}

	async function approveInbox(id: string) {
		await apiSend(apiPaths.whatsappInboxApprove(id), 'POST');
		activeInboxId = null;
		message = '';
		drafts = [];
		await queryClient.invalidateQueries({ queryKey: ['whatsapp', 'inbox'] });
	}

	function updateDraft(index: number, patch: Partial<TransactionDraft>) {
		drafts = drafts.map((d, i) => (i === index ? { ...d, ...patch } : d));
	}

	async function saveDraft(index: number) {
		const draft = drafts[index];
		drafts = drafts.map((d, i) => (i === index ? { ...d, _status: 'saving', _error: null } : d));
		let tenantBase: 'TRY' | 'GBP' | 'EUR' | 'USD' = 'TRY';
		try {
			const tenant = await apiGet<{ base_currency: 'TRY' | 'GBP' | 'EUR' | 'USD' }>(
				'/v1/tenants/current'
			);
			tenantBase = tenant.base_currency;
		} catch {
			/* keep TRY */
		}
		const currency = draft.currency;
		const stubRate = currency === 'GBP' ? 43 : currency === 'EUR' ? 36 : currency === 'USD' ? 34 : 1;
		let amount_base = draft.counterparty_amount ?? null;
		let fx_rate: number | null = null;
		if (currency === tenantBase) {
			amount_base = draft.amount;
			fx_rate = 1;
		} else if (amount_base == null) {
			// Demo: AI henüz baz tutar vermediyse yaklaşık kur ile doldur (onay ekranında görünür olmalı ileride)
			amount_base = Math.round((draft.amount / 100) * stubRate * 100);
			fx_rate = stubRate;
		} else {
			fx_rate = stubRate;
		}
		const payload: TransactionCreate = {
			kind: draft.kind,
			title: draft.title.trim(),
			subtitle: null,
			category: draft.category ?? null,
			occurred_on: draft.occurred_on,
			status: 'paid',
			invoice_status: 'none',
			payment_method: draft.payment_method ?? null,
			amount: draft.amount,
			paid_amount: draft.amount,
			currency,
			patient_id: draft.patient_id ?? null,
			contact_id: null,
			contact_label: draft.contact_label ?? null,
			amount_base,
			base_currency: tenantBase,
			fx_rate,
			fx_dated: draft.occurred_on,
			description: draft.description ?? null
		};
		try {
			await apiSend('/v1/transactions', 'POST', payload);
			drafts = drafts.map((d, i) => (i === index ? { ...d, _status: 'saved', _error: null } : d));
			await queryClient.invalidateQueries({ queryKey: ['transactions'] });
			if (activeInboxId && drafts.every((d) => d._status === 'saved')) {
				await approveInbox(activeInboxId);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Kayıt başarısız';
			drafts = drafts.map((d, i) => (i === index ? { ...d, _status: 'error', _error: msg } : d));
		}
	}

	function previewBody(item: InboundMessage): string {
		if (item.body?.trim()) return item.body;
		return item.has_media ? '(boş mesaj)' : '—';
	}
</script>

<svelte:head>
	<title>AI ile İşlem · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<PageHeader
		title="AI ile İşlem"
		description="WhatsApp grup mesajını yapıştır veya kuyruktan seç — AI işlemleri ayrıştırır, onayladıktan sonra kayıt açılır."
	/>

	<!-- Manuel yapıştır -->
	<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
		<h2 class="mb-3 text-sm font-semibold text-text">Mesajı yapıştır</h2>
		<textarea
			class="min-h-28 w-full resize-y rounded-[6px] border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40"
			placeholder={PLACEHOLDER}
			bind:value={message}
			rows={6}></textarea>

		{#if parseError && !activeInboxId}
			<p class="mt-2 text-sm text-danger">{parseError}</p>
		{/if}

		{#if showLongWarning}
			<div class="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
				<p class="text-text">Bu mesaj uzun olabilir. Daha iyi sonuç için bölerek yapıştırın.</p>
				<div class="mt-2 flex gap-2">
					<Button
						size="sm"
						type="button"
						onclick={() => {
							showLongWarning = false;
							void analyzeText(message);
						}}
					>
						Yine de dene
					</Button>
					<Button
						size="sm"
						variant="outline"
						type="button"
						onclick={() => (showLongWarning = false)}
					>
						İptal
					</Button>
				</div>
			</div>
		{/if}

		<div class="mt-3 flex flex-wrap items-center gap-2">
			<Button type="button" disabled={parsing || !message.trim()} onclick={requestAnalyze}>
				<Sparkles class="size-4" />
				{parsing ? 'Analiz ediliyor…' : 'Analiz Et'}
			</Button>
			{#if activeInboxId}
				<span class="text-xs text-text-faint">Onay Kuyruğu'ndan seçildi</span>
			{/if}
		</div>
	</section>

	<!-- Bekleyenler -->
	<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<h2 class="text-sm font-semibold text-text">
				Bekleyenler
				{#if pendingCount > 0}
					<span class="font-normal text-text-muted">({pendingCount})</span>
				{/if}
			</h2>
			<Button
				variant="outline"
				size="sm"
				type="button"
				disabled={processing}
				onclick={processNewMessages}
			>
				{processing ? 'İşleniyor…' : 'Yeni mesajları işle'}
			</Button>
		</div>

		{#if inboxQuery.isPending}
			<p class="text-sm text-text-muted">Yükleniyor…</p>
		{:else if pendingMessages.length === 0}
			<p class="text-sm text-text-muted">Bekleyen mesaj yok.</p>
		{:else}
			<ul class="divide-y divide-border">
				{#each pendingMessages as item (item.id)}
					<li
						class="flex min-w-0 flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start"
					>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="truncate font-mono text-xs text-text-faint">{item.sender}</span>
								<StatusBadge
									label={inboundMessageStatusLabels[item.status]}
									tone={item.status === 'new' ? 'warning' : 'info'}
								/>
								{#if item.has_media}
									<StatusBadge label="Medya" tone="neutral" />
								{/if}
								<time
									class="ml-auto text-xs whitespace-nowrap text-text-faint"
									datetime={item.created_at}
								>
									{formatDateTime(item.created_at)}
								</time>
							</div>
							<p class="mt-1 line-clamp-2 text-sm text-text">{previewBody(item)}</p>
							{#if item.has_media && item.media_path}
								<p class="mt-1 flex items-center gap-1 text-xs text-info">
									<Paperclip class="size-3" />
									Dosya eki (demo)
								</p>
							{/if}
						</div>
						<div class="flex shrink-0 gap-2">
							<Button
								size="sm"
								type="button"
								disabled={parsing}
								onclick={() => analyzeInboxItem(item)}
							>
								Analiz Et
							</Button>
							<Button
								size="sm"
								variant="outline"
								type="button"
								onclick={() => ignoreInbox(item.id)}
							>
								Yoksay
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Taslaklar -->
	{#if drafts.length > 0}
		<section class="mt-4 space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">
					Taslaklar <span class="font-normal text-text-muted">({drafts.length})</span>
				</h2>
				{#if activeInboxId}
					<Button
						size="sm"
						variant="outline"
						type="button"
						onclick={() => approveInbox(activeInboxId!)}
					>
						Kuyruğu onayla
					</Button>
				{/if}
			</div>

			{#if parseError && activeInboxId}
				<p class="text-sm text-danger">{parseError}</p>
			{/if}

			{#each drafts as draft, i (i)}
				<TransactionDraftCard
					{draft}
					{patients}
					onchange={(patch) => updateDraft(i, patch)}
					onsave={() => saveDraft(i)}
				/>
			{/each}

			<p class="text-xs text-text-faint">
				AI çıktısı taslaktır; kaydetmeden önce alanları kontrol edin. Backend sezgisel parser
				kullanıyor (LLM henüz yok).
			</p>
		</section>
	{/if}
</div>

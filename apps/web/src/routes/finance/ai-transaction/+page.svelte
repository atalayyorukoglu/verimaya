<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import type {
		ApproveDraftItem,
		ApproveDraftsResponse,
		InboundMessage,
		Patient,
		Tenant,
		TransactionDraft
	} from '@verimaya/shared';
	import { apiPaths, approveDraftItemSchema, inboundMessageStatusLabels } from '@verimaya/shared';
	import { apiGet, apiSend, listUrl } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDateTime } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import TransactionDraftCard, {
		type DraftApprovalState
	} from '$lib/components/TransactionDraftCard.svelte';
	import { Button } from '$lib/components/ui/button';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	type PatientsPage = { items: Patient[]; next_cursor: string | null };
	type DraftState = DraftApprovalState & { contact_id: string | null };

	const queryClient = useQueryClient();
	const qs = useQueryScope();
	let message = $state('');
	let parsing = $state(false);
	let parseError = $state<string | null>(null);
	let processing = $state(false);
	let approving = $state(false);
	let drafts = $state<DraftState[]>([]);
	let activeInboxId = $state<string | null>(null);
	let showLongWarning = $state(false);
	/** AI çıktısının orijinali — kullanıcı düzelttiğinde correction kaydı için kıyaslanır. */
	let originalDrafts = $state<TransactionDraft[]>([]);

	const inboxQuery = createQuery(() => ({
		queryKey: qs.keys.whatsapp.inbox(),
		queryFn: () => apiGet<{ messages: InboundMessage[] }>(apiPaths.whatsappInbox),
		enabled: qs.ready
	}));

	const patientsQuery = createQuery(() => ({
		queryKey: qs.keys.patients.list({ limit: 100, for: 'whatsapp' }),
		queryFn: () => apiGet<PatientsPage>(listUrl('patients', { limit: 100 })),
		enabled: qs.ready
	}));

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>(apiPaths.tenantsCurrent),
		enabled: qs.ready
	}));

	const patients = $derived(patientsQuery.data?.items ?? []);
	const baseCurrency = $derived(tenantQuery.data?.base_currency ?? 'TRY');
	const pendingMessages = $derived(
		(inboxQuery.data?.messages ?? []).filter((m) => m.status === 'new' || m.status === 'parsed')
	);
	const pendingCount = $derived(pendingMessages.filter((m) => m.status === 'new').length);

	function initDrafts(records: TransactionDraft[]): DraftState[] {
		return records.map((r) => {
			const same = r.currency === baseCurrency;
			return {
				...r,
				status: null,
				paid_amount: null,
				fx_rate: same ? 1 : null,
				amount_base: same ? r.amount : (r.counterparty_amount ?? null),
				contact_id: null,
				_status: 'idle' as const,
				_error: null
			};
		});
	}

	function setDrafts(records: TransactionDraft[]) {
		originalDrafts = records;
		drafts = initDrafts(records);
	}

	function draftReady(d: DraftState): boolean {
		const item = {
			kind: d.kind,
			amount: d.amount,
			currency: d.currency,
			counterparty_amount: d.counterparty_amount,
			title: d.title,
			category: d.category,
			subcategory: d.subcategory,
			patient_id: d.patient_id,
			patient_display_name: d.patient_display_name,
			contact_label: d.contact_label,
			occurred_on: d.occurred_on,
			payment_method: d.payment_method,
			description: d.description,
			status: d.status,
			paid_amount: d.paid_amount,
			fx_rate: d.fx_rate,
			amount_base: d.amount_base,
			contact_id: d.contact_id
		};
		return approveDraftItemSchema.safeParse(item).success;
	}

	const canApprove = $derived(
		Boolean(activeInboxId) && drafts.length > 0 && drafts.every(draftReady) && !approving
	);

	$effect(() => {
		const inboxId = page.url.searchParams.get('inbox');
		if (!inboxId || inboxId === activeInboxId) return;
		const item = pendingMessages.find((m) => m.id === inboxId);
		if (!item) return;
		activeInboxId = inboxId;
		message = item.body ?? '';
		if (item.parsed_records && item.parsed_records.length > 0) {
			setDrafts(item.parsed_records);
		} else {
			originalDrafts = [];
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
			setDrafts(res.records);
			if (res.records.length === 0) parseError = t('finance.ai.parse.none');
		} catch (err) {
			parseError = err instanceof Error ? err.message : t('finance.ai.parse.failed');
			drafts = [];
			originalDrafts = [];
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
			setDrafts(res.records);
			if (res.records.length === 0) {
				parseError = item.has_media ? t('finance.ai.parse.media') : t('finance.ai.parse.none');
			}
			await queryClient.invalidateQueries({ queryKey: qs.keys.whatsapp.inbox() });
		} catch (err) {
			parseError = err instanceof Error ? err.message : t('finance.ai.parse.failed');
			drafts = [];
			originalDrafts = [];
		} finally {
			parsing = false;
		}
	}

	async function processNewMessages() {
		processing = true;
		try {
			await apiSend(apiPaths.whatsappInboxProcess, 'POST');
			await queryClient.invalidateQueries({ queryKey: qs.keys.whatsapp.inbox() });
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
			originalDrafts = [];
		}
		await queryClient.invalidateQueries({ queryKey: qs.keys.whatsapp.inbox() });
	}

	function updateDraft(index: number, patch: Partial<DraftState>) {
		drafts = drafts.map((d, i) => (i === index ? { ...d, ...patch } : d));
	}

	function toApproveItem(d: DraftState): ApproveDraftItem {
		const parsed = approveDraftItemSchema.parse({
			kind: d.kind,
			amount: d.amount,
			currency: d.currency,
			counterparty_amount: d.counterparty_amount,
			title: d.title,
			category: d.category,
			subcategory: d.subcategory,
			patient_id: d.patient_id,
			patient_display_name: d.patient_display_name,
			contact_label: d.contact_label,
			occurred_on: d.occurred_on,
			payment_method: d.payment_method,
			description: d.description,
			status: d.status,
			paid_amount: d.paid_amount,
			fx_rate: d.fx_rate,
			amount_base: d.amount_base,
			contact_id: d.contact_id
		});
		return parsed;
	}

	async function approveAll() {
		if (!activeInboxId || !canApprove) return;
		approving = true;
		parseError = null;
		drafts = drafts.map((d) => ({ ...d, _status: 'saving', _error: null }));
		try {
			const items = drafts.map(toApproveItem);
			await apiSend<ApproveDraftsResponse>(
				apiPaths.whatsappInboxApproveDrafts(activeInboxId),
				'POST',
				{
					drafts: items,
					original_parsed: originalDrafts.length > 0 ? originalDrafts : undefined
				}
			);
			drafts = drafts.map((d) => ({ ...d, _status: 'saved', _error: null }));
			await queryClient.invalidateQueries({ queryKey: qs.keys.transactions.all() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.whatsapp.inbox() });
			activeInboxId = null;
			message = '';
			drafts = [];
			originalDrafts = [];
		} catch (err) {
			const msg = err instanceof Error ? err.message : t('finance.ai.approve.failed');
			parseError = msg;
			drafts = drafts.map((d) => ({ ...d, _status: 'error', _error: msg }));
		} finally {
			approving = false;
		}
	}

	function previewBody(item: InboundMessage): string {
		if (item.body?.trim()) return item.body;
		return item.has_media ? t('finance.ai.pending.emptyBody') : '—';
	}
</script>

<svelte:head>
	<title>{t('finance.ai.title')} · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<PageHeader title={t('finance.ai.title')} description={t('finance.ai.description')} />

	<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
		<h2 class="mb-3 text-sm font-semibold text-text">{t('finance.ai.paste.heading')}</h2>
		<textarea
			class="min-h-28 w-full resize-y rounded-[6px] border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40"
			placeholder={t('finance.ai.paste.placeholder')}
			bind:value={message}
			rows={6}></textarea>

		{#if parseError && !activeInboxId}
			<p class="mt-2 text-sm text-danger">{parseError}</p>
		{/if}

		{#if showLongWarning}
			<div class="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
				<p class="text-text">{t('finance.ai.paste.longWarning')}</p>
				<div class="mt-2 flex gap-2">
					<Button
						size="sm"
						type="button"
						onclick={() => {
							showLongWarning = false;
							void analyzeText(message);
						}}
					>
						{t('finance.ai.paste.tryAnyway')}
					</Button>
					<Button
						size="sm"
						variant="outline"
						type="button"
						onclick={() => (showLongWarning = false)}
					>
						{t('finance.ai.paste.cancel')}
					</Button>
				</div>
			</div>
		{/if}

		<div class="mt-3 flex flex-wrap items-center gap-2">
			<Button type="button" disabled={parsing || !message.trim()} onclick={requestAnalyze}>
				<Sparkles class="size-4" />
				{parsing ? t('finance.ai.analyzing') : t('finance.ai.analyze')}
			</Button>
			{#if activeInboxId}
				<span class="text-xs text-text-faint">{t('finance.ai.fromQueue')}</span>
			{/if}
		</div>
	</section>

	<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<h2 class="text-sm font-semibold text-text">
				{t('finance.ai.pending.heading')}
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
				{processing ? t('finance.ai.pending.processing') : t('finance.ai.pending.process')}
			</Button>
		</div>

		{#if inboxQuery.isPending}
			<p class="text-sm text-text-muted">{t('finance.ai.pending.loading')}</p>
		{:else if pendingMessages.length === 0}
			<p class="text-sm text-text-muted">{t('finance.ai.pending.empty')}</p>
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
									<StatusBadge label={t('finance.ai.pending.media')} tone="neutral" />
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
									{t('finance.ai.pending.mediaDemo')}
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
								{t('finance.ai.analyze')}
							</Button>
							<Button
								size="sm"
								variant="outline"
								type="button"
								onclick={() => ignoreInbox(item.id)}
							>
								{t('finance.ai.pending.ignore')}
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if drafts.length > 0}
		<section class="mt-4 space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">
					{t('finance.ai.drafts.heading')}
					<span class="font-normal text-text-muted">({drafts.length})</span>
				</h2>
				{#if activeInboxId}
					<Button size="sm" type="button" disabled={!canApprove} onclick={approveAll}>
						{approving ? t('finance.ai.drafts.approving') : t('finance.ai.drafts.approve')}
					</Button>
				{/if}
			</div>

			{#if !activeInboxId}
				<p class="text-sm text-warning">{t('finance.ai.drafts.needInbox')}</p>
			{/if}

			{#if parseError && activeInboxId}
				<p class="text-sm text-danger">{parseError}</p>
			{/if}

			{#each drafts as draft, i (i)}
				<TransactionDraftCard
					{draft}
					{patients}
					{baseCurrency}
					onchange={(patch) => updateDraft(i, patch)}
				/>
			{/each}

			<p class="text-xs text-text-faint">{t('finance.ai.drafts.footnote')}</p>
		</section>
	{/if}
</div>

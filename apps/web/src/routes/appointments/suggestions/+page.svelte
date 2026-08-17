<script lang="ts">
	import { resolve } from '$app/paths';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { RecordUpdateSuggestion } from '@verimaya/shared';
	import { apiPaths, listUrl } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatDateTime } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import { useQueryScope } from '$lib/query-scope.svelte';

	const qs = useQueryScope();
	const queryClient = useQueryClient();

	let message = $state('');
	let parsing = $state(false);
	let parseError = $state<string | null>(null);
	let actingId = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let rejectOpenId = $state<string | null>(null);
	let rejectReason = $state('');

	const confidenceKey: Record<RecordUpdateSuggestion['confidence'], MessageKey> = {
		high: 'appointments.suggestions.confidence.high',
		medium: 'appointments.suggestions.confidence.medium'
	};

	const listQuery = createQuery(() => ({
		queryKey: qs.keys.recordUpdateSuggestions.list({ status: 'pending' }),
		queryFn: () =>
			apiGet<{ items: RecordUpdateSuggestion[]; next_cursor: string | null }>(
				listUrl('record-suggestions', { status: 'pending', limit: 50 })
			),
		enabled: qs.ready
	}));

	const items = $derived(listQuery.data?.items ?? []);

	async function parseMessage() {
		const trimmed = message.trim();
		if (!trimmed) return;
		parsing = true;
		parseError = null;
		try {
			await apiSend(apiPaths.recordSuggestionsParse, 'POST', { message: trimmed });
			message = '';
			await queryClient.invalidateQueries({ queryKey: qs.keys.recordUpdateSuggestions.all() });
		} catch (err) {
			parseError = err instanceof Error ? err.message : t('appointments.suggestions.parseFailed');
		} finally {
			parsing = false;
		}
	}

	async function approveSuggestion(item: RecordUpdateSuggestion) {
		actingId = item.id;
		actionError = null;
		try {
			await apiSend(apiPaths.recordSuggestionApprove(item.id), 'POST', {});
			await queryClient.invalidateQueries({ queryKey: qs.keys.recordUpdateSuggestions.all() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.appointments.all() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.operationAlerts.all() });
		} catch (err) {
			actionError =
				err instanceof Error ? err.message : t('appointments.suggestions.approveFailed');
		} finally {
			actingId = null;
		}
	}

	function openReject(item: RecordUpdateSuggestion) {
		rejectOpenId = item.id;
		rejectReason = '';
		actionError = null;
	}

	function closeReject() {
		rejectOpenId = null;
		rejectReason = '';
	}

	async function confirmReject(item: RecordUpdateSuggestion) {
		actingId = item.id;
		actionError = null;
		try {
			await apiSend(apiPaths.recordSuggestionReject(item.id), 'POST', {
				reason: rejectReason.trim() || undefined
			});
			closeReject();
			await queryClient.invalidateQueries({ queryKey: qs.keys.recordUpdateSuggestions.all() });
		} catch (err) {
			actionError = err instanceof Error ? err.message : t('appointments.suggestions.rejectFailed');
		} finally {
			actingId = null;
		}
	}
</script>

<svelte:head>
	<title>{t('appointments.suggestions.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<a href={resolve('/appointments')} class="text-sm font-medium text-brand hover:underline"
			>{t('appointments.suggestions.back')}</a
		>
	</div>

	<PageHeader
		title={t('appointments.suggestions.title')}
		description={t('appointments.suggestions.description')}
		helpTopic="record-suggestions"
	/>

	<section class="mb-6 rounded-[8px] border border-border bg-surface p-4">
		<h2 class="mb-2 text-sm font-semibold text-text">{t('appointments.suggestions.parseTitle')}</h2>
		<p class="mb-3 text-sm text-text-muted">{t('appointments.suggestions.parseHint')}</p>
		<textarea
			class="mb-3 min-h-24 w-full rounded-[6px] border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40"
			placeholder={t('appointments.suggestions.parsePlaceholder')}
			bind:value={message}></textarea>
		{#if parseError}
			<p class="mb-2 text-sm text-danger">{parseError}</p>
		{/if}
		<Button type="button" disabled={parsing || !message.trim()} onclick={parseMessage}>
			{parsing ? t('appointments.suggestions.parsing') : t('appointments.suggestions.parseAction')}
		</Button>
	</section>

	{#if actionError}
		<p class="mb-3 text-sm text-danger">{actionError}</p>
	{/if}

	{#if listQuery.isPending}
		<p class="text-sm text-text-muted">{t('appointments.suggestions.loading')}</p>
	{:else if listQuery.isError}
		<p class="text-sm text-danger">{t('appointments.suggestions.loadError')}</p>
	{:else if items.length === 0}
		<p class="text-sm text-text-muted">{t('appointments.suggestions.empty')}</p>
	{:else}
		<ul class="space-y-4">
			{#each items as item (item.id)}
				<li class="rounded-[8px] border border-border bg-surface p-4">
					<div class="mb-2 flex flex-wrap items-start justify-between gap-2">
						<div>
							<p class="font-medium text-text">{item.contact_display_name}</p>
							<p class="text-sm text-text-muted">{item.source_text}</p>
						</div>
						<span
							class="rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand-text"
						>
							{t(confidenceKey[item.confidence])}
						</span>
					</div>
					<p class="mb-3 text-sm text-text">
						<span class="text-text-muted">{t('appointments.suggestions.current')}:</span>
						{formatDateTime(item.current_value)}
						<span class="mx-2 text-text-muted">→</span>
						<span class="font-medium">{formatDateTime(item.suggested_value)}</span>
					</p>
					<div class="flex flex-wrap gap-2">
						<Button
							type="button"
							size="sm"
							disabled={actingId === item.id}
							onclick={() => approveSuggestion(item)}
						>
							{actingId === item.id
								? t('appointments.suggestions.approving')
								: t('appointments.suggestions.approve')}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={actingId === item.id}
							onclick={() => openReject(item)}
						>
							{t('appointments.suggestions.reject')}
						</Button>
					</div>
					{#if rejectOpenId === item.id}
						<div class="bg-surface-muted mt-3 rounded-[6px] border border-border p-3">
							<label class="mb-1 block text-xs font-medium text-text-muted" for="reject-{item.id}">
								{t('appointments.suggestions.rejectReasonLabel')}
							</label>
							<input
								id="reject-{item.id}"
								class="mb-2 w-full rounded-[6px] border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40"
								bind:value={rejectReason}
								placeholder={t('appointments.suggestions.rejectReasonPlaceholder')}
							/>
							<div class="flex gap-2">
								<Button
									type="button"
									size="sm"
									variant="destructive"
									disabled={actingId === item.id}
									onclick={() => confirmReject(item)}
								>
									{t('appointments.suggestions.rejectConfirm')}
								</Button>
								<Button type="button" size="sm" variant="ghost" onclick={closeReject}>
									{t('appointments.suggestions.rejectCancel')}
								</Button>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

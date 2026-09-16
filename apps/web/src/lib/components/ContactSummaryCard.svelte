<script lang="ts">
	/*
	 * KISI-01 adım 3 — kişi özeti kartı. Model yazar, elle düzenlenmez; her cümlenin
	 * yanında dayandığı kayıtlar (W/R/P/N + tarih) durur, üstüne gelince alıntı
	 * görünür. Kaynak veri değişince "kaynak değişti" rozeti ve Yenile.
	 *
	 * Çalışan notlarından AYRI: notlar akışta kalır, burası yalnız türetilmiş özet.
	 */
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { apiPaths, type ContactSummary, type ContactSummarySource } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDate, formatRelativeTime } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	let { contactId }: { contactId: string } = $props();

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const summaryQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.summary(contactId),
		queryFn: () => apiGet<ContactSummary>(apiPaths.contactSummary(contactId)),
		enabled: qs.ready
	}));

	let refreshing = $state(false);
	let error = $state<string | null>(null);

	/** Kart varsayılan olarak daraltık: ilk COLLAPSED_COUNT cümle + aç/kapa düğmesi
	 *  (kullanıcı geri bildirimi, 2026-09-16 — mobilde 6+ cümlelik özet ekranı
	 *  kaplayıp altındaki akışı sıkıştırıyordu). Kişi değişince yeniden daralt. */
	const COLLAPSED_COUNT = 2;
	let expanded = $state(false);
	$effect(() => {
		void contactId;
		expanded = false;
	});

	async function refresh() {
		if (refreshing) return;
		refreshing = true;
		error = null;
		try {
			const next = await apiSend<ContactSummary>(apiPaths.contactSummaryRefresh(contactId), 'POST');
			queryClient.setQueryData(qs.keys.contacts.summary(contactId), next);
		} catch (err) {
			error = err instanceof Error ? err.message : t('contacts.summary.refreshFailed');
		} finally {
			refreshing = false;
		}
	}

	const KIND_LETTER: Record<ContactSummarySource['kind'], string> = {
		whatsapp: 'W',
		appointment: 'R',
		transaction: 'P',
		note: 'N'
	};
	const KIND_STYLE: Record<ContactSummarySource['kind'], string> = {
		whatsapp: 'bg-tl-whatsapp-soft text-tl-whatsapp',
		appointment: 'bg-tl-appointment-soft text-tl-appointment',
		transaction: 'bg-tl-transaction-soft text-tl-transaction',
		note: 'bg-tl-note-soft text-tl-note'
	};

	function sourceTitle(s: ContactSummarySource): string {
		const kind = t(`contacts.summary.kind.${s.kind}`);
		const when = s.at ? formatDate(s.at) : '';
		return [kind, when, s.quote].filter(Boolean).join(' · ');
	}
</script>

{#if summaryQuery.data && (summaryQuery.data.sentences.length > 0 || summaryQuery.data.input_count > 0)}
	{@const s = summaryQuery.data}
	<section
		class="rounded-md border border-border bg-surface-2 px-3 py-2.5"
		aria-label={t('contacts.summary.title')}
	>
		<div class="flex items-center gap-2">
			<Sparkles class="size-3.5 text-brand" aria-hidden="true" />
			<span class="text-xs font-semibold text-text">{t('contacts.summary.title')}</span>
			{#if s.heuristic}
				<span class="rounded-full bg-surface px-1.5 py-px text-[10px] text-text-faint"
					>{t('contacts.summary.heuristic')}</span
				>
			{/if}
			{#if s.stale}
				<span class="rounded-full bg-warning/15 px-1.5 py-px text-[10px] text-text"
					>{t('contacts.summary.stale')}</span
				>
			{/if}
			<span class="ml-auto flex items-center gap-2 text-[11px] text-text-faint">
				{#if s.generated_at}
					<time datetime={s.generated_at}>{formatRelativeTime(s.generated_at)}</time>
				{/if}
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-text-muted transition-colors hover:text-text disabled:opacity-40"
					disabled={refreshing}
					onclick={() => void refresh()}
					aria-label={t('contacts.summary.refresh')}
					title={t('contacts.summary.refresh')}
				>
					<RefreshCw class="size-3 {refreshing ? 'animate-spin' : ''}" />
					{refreshing ? t('contacts.summary.refreshing') : t('contacts.summary.refresh')}
				</button>
			</span>
		</div>

		{#if s.sentences.length === 0}
			<p class="mt-1.5 text-sm text-text-faint">{t('contacts.summary.empty')}</p>
		{:else}
			{@const collapsible = s.sentences.length > COLLAPSED_COUNT}
			{@const visibleSentences =
				expanded || !collapsible ? s.sentences : s.sentences.slice(0, COLLAPSED_COUNT)}
			<ol class="mt-1.5 space-y-1">
				{#each visibleSentences as sentence, i (i)}
					<li class="text-sm leading-6 text-text">
						{sentence.text}
						{#each sentence.sources as src (src.kind + src.id)}
							<span
								class="ml-1 inline-flex h-4 items-center rounded-full px-1.5 align-middle text-[10px] font-medium {KIND_STYLE[
									src.kind
								]}"
								title={sourceTitle(src)}
							>
								{KIND_LETTER[src.kind]}{src.at ? ` ${formatDate(src.at)}` : ''}
							</span>
						{/each}
					</li>
				{/each}
			</ol>
			{#if collapsible}
				<button
					type="button"
					class="mt-1.5 text-xs font-medium text-brand hover:underline"
					aria-expanded={expanded}
					onclick={() => (expanded = !expanded)}
				>
					{expanded ? t('contacts.summary.showLess') : t('contacts.summary.showAll')}
				</button>
			{/if}
		{/if}
		{#if error}
			<p class="mt-1.5 text-xs text-danger">{error}</p>
		{/if}
	</section>
{:else if summaryQuery.isPending}
	<p class="text-xs text-text-faint">{t('contacts.summary.loading')}</p>
{/if}

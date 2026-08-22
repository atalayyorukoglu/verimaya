<script lang="ts">
	import type { TransactionEvidenceEntry } from '@verimaya/shared';
	import { t } from '$lib/i18n/locale.svelte';

	/**
	 * AI-09 — alan başına kaynak rozeti.
	 *
	 * Alıntı doluysa tıklanabilir: üstteki mesaj metninde ilgili cümle vurgulanır.
	 * Alıntı boşsa AI o değeri **okumadan** çıkarmıştır (sunucu yalnız
	 * `confidence: 'low'` ile bu hâli kabul eder) — rozet tıklanamaz ve
	 * "çıkarım" der; kullanıcının o alana ekstra bakması gerektiğini söyler.
	 */
	let {
		entry,
		onselect
	}: {
		entry: TransactionEvidenceEntry | null | undefined;
		onselect?: (entry: TransactionEvidenceEntry) => void;
	} = $props();

	const inferred = $derived(!entry || entry.quote.trim().length === 0);
	const confidenceLabel = $derived(
		entry ? t(`finance.ai.evidence.confidence.${entry.confidence}`) : ''
	);
	const tone = $derived(
		entry?.confidence === 'high'
			? 'border-success/30 bg-success/10 text-success'
			: entry?.confidence === 'medium'
				? 'border-warning/30 bg-warning/10 text-warning'
				: 'border-border bg-surface-2 text-text-muted'
	);
</script>

{#if entry}
	{#if inferred}
		<span
			class="inline-flex items-center rounded-full border px-1.5 py-px text-[10px] leading-4 font-medium {tone}"
			title={t('finance.ai.evidence.inferredHint')}
		>
			{t('finance.ai.evidence.inferred')}
		</span>
	{:else}
		<button
			type="button"
			class="inline-flex cursor-pointer items-center rounded-full border px-1.5 py-px text-[10px] leading-4 font-medium underline-offset-2 hover:underline {tone}"
			title={t('finance.ai.evidence.quoteHint', {
				quote: entry.quote,
				confidence: confidenceLabel
			})}
			onclick={() => onselect?.(entry)}
		>
			{t('finance.ai.evidence.source')}
		</button>
	{/if}
{/if}

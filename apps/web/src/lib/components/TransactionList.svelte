<script lang="ts">
	/*
	 * İşlem listesi — Finans sayfası ile kişi kartının "Finans Özet" sekmesi aynı
	 * görünümü paylaşsın diye buraya çıkarıldı (kullanıcı, 2026-09-16: "işlemler
	 * kişi kartında da görünsün, finansa gitmek zorunda kalmayayım"). Kopyalanmış
	 * ikinci bir tablo iki yerde ayrı ayrı bozulurdu.
	 *
	 * Masaüstünde tablo, mobilde kart listesi: ~400px'te tablo yatay taşıyor,
	 * `md` altında kartlara düşer. Tablo kabı yine de `overflow-x-auto` taşır —
	 * dar masaüstü penceresinde sayfanın tamamı kaymasın, yalnız tablo kaysın.
	 */
	import type { SupportedCurrency, Transaction } from '@verimaya/shared';
	import {
		deriveTransactionLines,
		transactionKindLabels,
		transactionStatusLabels
	} from '@verimaya/shared';
	import { formatDate, formatMoney } from '$lib/format';
	import { amountInBase } from '$lib/money-base';
	import { transactionStatusTone } from '$lib/status-tone';
	import { t } from '$lib/i18n/locale.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type Props = {
		items: Transaction[];
		baseCurrency?: SupportedCurrency;
		/** Satıra tıklanınca — çağıran taraf düzenleme dialog'unu açar. */
		onselect?: (tx: Transaction) => void;
		/** `false` verilirse başlık satırı gizlenir (dar gömülü listeler için). */
		showHeader?: boolean;
	};

	let { items, baseCurrency = 'TRY', onselect, showHeader = true }: Props = $props();

	/** Base equivalent only when txn currency differs and snapshot exists. */
	function baseLine(tx: Transaction): string | null {
		if (tx.currency === baseCurrency) return null;
		const base = amountInBase(tx, baseCurrency);
		if (base == null) return null;
		const sign = tx.kind === 'expense' ? '−' : '';
		return `${sign}${formatMoney(base, baseCurrency)}`;
	}
</script>

<div class="hidden min-w-0 overflow-x-auto rounded-lg border border-border bg-surface md:block">
	<table class="w-full table-fixed text-left text-sm">
		{#if showHeader}
			<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
				<tr>
					<th class="w-[14%] px-4 py-3 font-medium">{t('finance.col.date')}</th>
					<th class="w-[36%] px-4 py-3 font-medium">{t('finance.col.label')}</th>
					<th class="w-[12%] px-4 py-3 font-medium">{t('finance.col.kind')}</th>
					<th class="w-[16%] px-4 py-3 font-medium">{t('finance.col.status')}</th>
					<th class="w-[22%] px-4 py-3 text-right font-medium">{t('finance.col.amount')}</th>
				</tr>
			</thead>
		{/if}
		<tbody class="divide-y divide-border">
			{#each items as tx (tx.id)}
				{@const baseAmt = baseLine(tx)}
				{@const lines = deriveTransactionLines(tx)}
				<tr
					class="cursor-pointer transition-colors hover:bg-surface-2/60"
					onclick={() => onselect?.(tx)}
				>
					<td class="px-4 py-3 whitespace-nowrap text-text-muted">{formatDate(tx.occurred_on)}</td>
					<td class="min-w-0 px-4 py-3">
						<p class="truncate font-medium text-text">{lines.primary}</p>
						<p class="truncate text-xs text-text-faint">{lines.secondary}</p>
						{#if tx.description?.trim()}
							<!-- Uzun açıklama satır yüksekliğini patlatmasın: tek satırda kesilir. -->
							<p class="truncate text-xs text-text-muted">
								<span class="font-medium">{t('finance.card.description')}:</span>
								<span class="text-text-faint">{tx.description.trim()}</span>
							</p>
						{/if}
					</td>
					<td class="px-4 py-3 text-text-muted">{transactionKindLabels[tx.kind]}</td>
					<td class="px-4 py-3">
						<StatusBadge
							label={transactionStatusLabels[tx.status]}
							tone={transactionStatusTone(tx.status)}
						/>
					</td>
					<td
						class="px-4 py-3 text-right font-medium tabular-nums {tx.kind === 'income'
							? 'text-success'
							: 'text-text'}"
					>
						<p>
							{tx.kind === 'expense' ? '−' : ''}{formatMoney(tx.amount, tx.currency)}
						</p>
						{#if baseAmt}
							<p class="text-xs font-normal text-text-faint">{baseAmt}</p>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<ul class="space-y-2 md:hidden">
	{#each items as tx (tx.id)}
		{@const baseAmt = baseLine(tx)}
		{@const lines = deriveTransactionLines(tx)}
		<li class="min-w-0">
			<button
				type="button"
				class="w-full min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4 text-left"
				onclick={() => onselect?.(tx)}
			>
				<div class="flex min-w-0 items-start justify-between gap-2">
					<div class="min-w-0 flex-1 overflow-hidden">
						<p class="truncate text-sm font-medium text-text">{lines.primary}</p>
						<p class="truncate text-xs text-text-faint">{lines.secondary}</p>
						{#if tx.description?.trim()}
							<p class="line-clamp-2 text-xs text-text-muted">
								<span class="font-medium">{t('finance.card.description')}:</span>
								<span class="text-text-faint">{tx.description.trim()}</span>
							</p>
						{/if}
						<p class="text-xs text-text-faint">{formatDate(tx.occurred_on)}</p>
					</div>
					<div class="shrink-0 text-right">
						<p
							class="text-sm font-semibold tabular-nums {tx.kind === 'income'
								? 'text-success'
								: 'text-text'}"
						>
							{tx.kind === 'expense' ? '−' : ''}{formatMoney(tx.amount, tx.currency)}
						</p>
						{#if baseAmt}
							<p class="text-xs text-text-faint tabular-nums">{baseAmt}</p>
						{/if}
					</div>
				</div>
				<div class="mt-2">
					<StatusBadge
						label={transactionStatusLabels[tx.status]}
						tone={transactionStatusTone(tx.status)}
					/>
				</div>
			</button>
		</li>
	{/each}
</ul>

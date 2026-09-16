<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { ContactVisitLedger, SupportedCurrency } from '@verimaya/shared';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet } from '$lib/api';
	import { USE_MSW } from '$lib/env';
	import { formatMoney } from '$lib/format';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';

	/**
	 * PARA-01 — Kişi › Finans Özet'teki **vizit mutabakatı** tablosu.
	 *
	 * Özet kartı "toplam ne aldık, ne harcadık" der; bu tablo aynı soruyu vizit
	 * başına sorar: her satırda hasta ödemeleri, hasta giderleri (kategori kırılımıyla)
	 * ve kâr. Teklif toplamı yazılmış vizitlerde ayrıca "Kalan" satırı çıkar.
	 *
	 * Tablo `overflow-x-auto` bir kutu içinde: 400px genişlikte sayfa yatay kaymaz,
	 * tablo kendi içinde kayar.
	 */
	let { contactId, baseCurrency }: { contactId: string; baseCurrency: SupportedCurrency } =
		$props();

	const qs = useQueryScope();

	const ledgerQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.visitLedger(contactId),
		queryFn: () => apiGet<ContactVisitLedger>(apiPaths.contactVisitLedger(contactId)),
		enabled: !USE_MSW && qs.ready
	}));

	const ledger = $derived(ledgerQuery.data ?? null);
	const rows = $derived(ledger?.rows ?? []);
</script>

{#if !USE_MSW}
	<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
		<h2 class="text-sm font-semibold text-text">{t('contacts.visitLedger.title')}</h2>
		<p class="mt-1 text-xs text-text-muted">{t('contacts.visitLedger.why')}</p>

		{#if ledgerQuery.isPending}
			<p class="mt-3 text-sm text-text-muted">{t('contacts.finance.loading')}</p>
		{:else if ledgerQuery.isError}
			<p class="mt-3 text-sm text-danger">{t('contacts.visitLedger.loadError')}</p>
		{:else if rows.length === 0}
			<p class="mt-3 text-sm text-text-muted">{t('contacts.visitLedger.empty')}</p>
		{:else}
			<div class="mt-3 overflow-x-auto">
				<table class="w-full min-w-[34rem] text-left text-sm">
					<thead class="border-b border-border text-xs text-text-muted">
						<tr>
							<th class="py-2 pr-3 font-medium">{t('contacts.visitLedger.col.visit')}</th>
							<th class="py-2 pr-3 text-right font-medium"
								>{t('contacts.visitLedger.col.income')}</th
							>
							<th class="py-2 pr-3 text-right font-medium"
								>{t('contacts.visitLedger.col.expense')}</th
							>
							<th class="py-2 text-right font-medium">{t('contacts.visitLedger.col.profit')}</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each rows as row (row.visit_id ?? 'unknown')}
							<tr>
								<td class="py-2.5 pr-3 align-top">
									<span class="font-medium text-text">{row.visit_label}</span>
									{#if row.expense_by_category.length > 0}
										<ul class="mt-1 space-y-0.5">
											{#each row.expense_by_category as bucket (bucket.category ?? '—')}
												<li class="flex gap-2 text-xs text-text-muted">
													<span class="truncate"
														>{bucket.category ?? t('contacts.visitLedger.noCategory')}</span
													>
													<span class="shrink-0 tabular-nums"
														>{formatMoney(bucket.amount_base, baseCurrency)}</span
													>
												</li>
											{/each}
										</ul>
									{/if}
									{#if row.quoted_total_minor != null && row.quoted_currency}
										<p class="mt-1 text-xs text-warning">
											{t('contacts.visitLedger.remaining', {
												quoted: formatMoney(row.quoted_total_minor, row.quoted_currency),
												collected: formatMoney(
													row.collected_quoted_minor ?? 0,
													row.quoted_currency
												),
												remaining: formatMoney(row.remaining_quoted_minor ?? 0, row.quoted_currency)
											})}
										</p>
									{/if}
									{#if row.other_currency_income_count > 0}
										<p class="mt-1 text-xs text-text-faint">
											{t('contacts.visitLedger.otherCurrency', {
												count: String(row.other_currency_income_count)
											})}
										</p>
									{/if}
									{#if row.unconverted_count > 0}
										<p class="mt-1 text-xs text-text-faint">
											{t('contacts.visitLedger.unconverted', {
												count: String(row.unconverted_count)
											})}
										</p>
									{/if}
								</td>
								<td class="py-2.5 pr-3 text-right align-top text-success tabular-nums">
									+{formatMoney(row.income_base, baseCurrency)}
								</td>
								<td class="py-2.5 pr-3 text-right align-top text-danger tabular-nums">
									−{formatMoney(row.expense_base, baseCurrency)}
								</td>
								<td
									class="py-2.5 text-right align-top font-semibold tabular-nums {row.profit_base >=
									0
										? 'text-text'
										: 'text-danger'}"
								>
									{formatMoney(row.profit_base, baseCurrency)}
								</td>
							</tr>
						{/each}
					</tbody>
					<tfoot class="border-t border-border">
						<tr class="text-sm font-semibold">
							<td class="py-2.5 pr-3 text-text">{t('contacts.visitLedger.total')}</td>
							<td class="py-2.5 pr-3 text-right text-success tabular-nums">
								+{formatMoney(ledger?.totals.income_base ?? 0, baseCurrency)}
							</td>
							<td class="py-2.5 pr-3 text-right text-danger tabular-nums">
								−{formatMoney(ledger?.totals.expense_base ?? 0, baseCurrency)}
							</td>
							<td
								class="py-2.5 text-right tabular-nums {(ledger?.totals.profit_base ?? 0) >= 0
									? 'text-text'
									: 'text-danger'}"
							>
								{formatMoney(ledger?.totals.profit_base ?? 0, baseCurrency)}
							</td>
						</tr>
					</tfoot>
				</table>
			</div>
		{/if}
	</section>
{/if}

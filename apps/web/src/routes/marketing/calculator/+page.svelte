<script lang="ts">
	import {
		calculateTruthMetrics,
		type ProfitStatus,
		type TruthCalculatorResult
	} from '@verimaya/shared';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { fieldClass, labelClass } from '$lib/api';
	import { formatMoney, formatPercent, formatRatio, parseMoneyInput } from '$lib/format';

	let platformRoasText = $state('3,3');
	let salePriceText = $state('1000');
	let operationCostText = $state('400');
	let commissionText = $state('50');
	let platformExtraFeeText = $state('2');
	let targetMarginText = $state('');

	function parseNumberInput(value: string): number | null {
		const raw = value.trim().replace(/\s/g, '');
		if (!raw) return null;

		let normalized = raw;
		const lastComma = raw.lastIndexOf(',');
		const lastDot = raw.lastIndexOf('.');

		if (lastComma !== -1 && lastDot !== -1) {
			if (lastComma > lastDot) {
				normalized = raw.replace(/\./g, '').replace(',', '.');
			} else {
				normalized = raw.replace(/,/g, '');
			}
		} else if (lastComma !== -1) {
			normalized = raw.replace(',', '.');
		}

		const n = Number(normalized);
		return Number.isFinite(n) ? n : null;
	}

	const result = $derived.by((): TruthCalculatorResult | null => {
		const platformRoas = parseNumberInput(platformRoasText);
		const salePrice = parseMoneyInput(salePriceText);
		const operationCost = parseMoneyInput(operationCostText);
		const commission = parseMoneyInput(commissionText);
		const platformExtraFeePercent = parseNumberInput(platformExtraFeeText);

		if (
			platformRoas === null ||
			salePrice === null ||
			operationCost === null ||
			commission === null ||
			platformExtraFeePercent === null
		) {
			return null;
		}

		const targetMarginPercent = parseNumberInput(targetMarginText);

		return calculateTruthMetrics({
			platformRoas,
			salePrice,
			operationCost,
			commission,
			platformExtraFeePercent,
			...(targetMarginPercent !== null ? { targetMarginPercent } : {})
		});
	});

	function profitBadge(status: ProfitStatus): {
		label: string;
		tone: 'success' | 'danger' | 'neutral';
	} {
		switch (status) {
			case 'profitable':
				return { label: 'Kârlı', tone: 'success' };
			case 'losing':
				return { label: 'Zarar', tone: 'danger' };
			case 'break_even':
				return { label: 'Başabaş', tone: 'neutral' };
		}
	}
</script>

<svelte:head>
	<title>Hesap · Pazarlama · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-5xl min-w-0">
	<PageHeader
		title="Hesap"
		description="Platform ROAS’ını katkı payı ve maliyetlerle gerçek kâra çevirin."
	/>

	<div class="grid gap-4 lg:grid-cols-2">
		<section class="rounded-lg border border-border bg-surface p-5">
			<h2 class="mb-4 text-sm font-semibold text-text">Girdiler</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="sm:col-span-2">
					<label class={labelClass} for="tc-platform-roas">Platform ROAS</label>
					<input
						id="tc-platform-roas"
						class={fieldClass}
						bind:value={platformRoasText}
						inputmode="decimal"
						placeholder="3,3"
						autocomplete="off"
					/>
					<p class="mt-1 text-xs text-text-muted">Reklam panelinde raporlanan ROAS</p>
				</div>
				<div>
					<label class={labelClass} for="tc-sale-price">Satış fiyatı (TL)</label>
					<input
						id="tc-sale-price"
						class={fieldClass}
						bind:value={salePriceText}
						inputmode="decimal"
						placeholder="1.000"
						autocomplete="off"
					/>
				</div>
				<div>
					<label class={labelClass} for="tc-operation-cost">Operasyon maliyeti (TL)</label>
					<input
						id="tc-operation-cost"
						class={fieldClass}
						bind:value={operationCostText}
						inputmode="decimal"
						placeholder="400"
						autocomplete="off"
					/>
				</div>
				<div>
					<label class={labelClass} for="tc-commission">Komisyon (TL)</label>
					<input
						id="tc-commission"
						class={fieldClass}
						bind:value={commissionText}
						inputmode="decimal"
						placeholder="50"
						autocomplete="off"
					/>
				</div>
				<div>
					<label class={labelClass} for="tc-extra-fee">Platform ek ücreti (%)</label>
					<input
						id="tc-extra-fee"
						class={fieldClass}
						bind:value={platformExtraFeeText}
						inputmode="decimal"
						placeholder="2"
						autocomplete="off"
					/>
				</div>
				<div class="sm:col-span-2">
					<label class={labelClass} for="tc-target-margin">Hedef net marj (%) — opsiyonel</label>
					<input
						id="tc-target-margin"
						class={fieldClass}
						bind:value={targetMarginText}
						inputmode="decimal"
						placeholder="15"
						autocomplete="off"
					/>
				</div>
			</div>
		</section>

		<section class="rounded-lg border border-border bg-surface p-5">
			<h2 class="mb-4 text-sm font-semibold text-text">Sonuç</h2>
			{#if result}
				{@const badge = profitBadge(result.profitStatus)}
				<div class="mb-4">
					<StatusBadge label={badge.label} tone={badge.tone} />
				</div>
				<dl class="space-y-3 text-sm">
					<div class="flex items-baseline justify-between gap-3">
						<dt class="text-text-muted">Katkı payı</dt>
						<dd class="text-right font-medium text-text">
							{formatMoney(result.contributionMargin)}
							<span class="ml-1 font-normal text-text-muted"
								>({formatPercent(result.contributionRate)})</span
							>
						</dd>
					</div>
					<div class="flex items-baseline justify-between gap-3">
						<dt class="text-text-muted">Gerçek ROAS</dt>
						<dd class="font-medium text-text">{formatRatio(result.realRoas)}</dd>
					</div>
					<div class="flex items-baseline justify-between gap-3">
						<dt class="text-text-muted">Başabaş ROAS</dt>
						<dd class="font-medium text-text">{formatRatio(result.breakEvenRoas)}</dd>
					</div>
					<div class="flex items-baseline justify-between gap-3">
						<dt class="text-text-muted">İma edilen reklam maliyeti</dt>
						<dd class="font-medium text-text">{formatMoney(result.impliedAdCost)}</dd>
					</div>
					<div class="flex items-baseline justify-between gap-3">
						<dt class="text-text-muted">Müşteri başı net kâr</dt>
						<dd class="font-medium text-text">{formatMoney(result.netProfitPerCustomer)}</dd>
					</div>
					<div class="flex items-baseline justify-between gap-3 border-t border-border pt-3">
						<dt class="text-text-muted">Maks. reklam maliyeti (hedef marj)</dt>
						<dd class="font-medium text-text">
							{result.maxAdCostPerCustomer === null
								? '—'
								: formatMoney(result.maxAdCostPerCustomer)}
						</dd>
					</div>
				</dl>
			{:else}
				<p class="text-sm text-text-muted">
					Zorunlu alanları geçerli sayılarla doldurun; sonuç burada görünür.
				</p>
			{/if}
		</section>
	</div>
</div>

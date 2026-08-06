<script lang="ts">
	import {
		calculateAdSimulation,
		type AdSimulatorResult,
		type TrafficLight
	} from '@verimaya/shared';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { fieldClass, labelClass } from '$lib/api';
	import { formatMoney, formatPercent, parseMoneyInput } from '$lib/format';

	let cpcText = $state('250');
	let conversionRateText = $state('5');
	let salesRateText = $state('10');
	let contributionPerSaleText = $state('100000');
	let fixedCostMonthlyText = $state('750000');
	let maxMonthlyBudgetText = $state('');
	let monthlyClickVolumeText = $state('');
	let targetSalesText = $state('');
	let maxAdShareText = $state('');

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

	function formatCount(value: number | null | undefined, digits = 0): string {
		if (value === null || value === undefined || !Number.isFinite(value)) return '—';
		return new Intl.NumberFormat('tr-TR', {
			maximumFractionDigits: digits,
			minimumFractionDigits: digits
		}).format(value);
	}

	function formatMoneyOrDash(value: number | null | undefined): string {
		if (value === null || value === undefined) return '—';
		return formatMoney(value);
	}

	const result = $derived.by((): AdSimulatorResult | null => {
		const cpc = parseMoneyInput(cpcText);
		const conversionRatePercent = parseNumberInput(conversionRateText);
		const salesRatePercent = parseNumberInput(salesRateText);
		const contributionPerSale = parseMoneyInput(contributionPerSaleText);
		const fixedCostMonthly = parseMoneyInput(fixedCostMonthlyText);

		if (
			cpc === null ||
			conversionRatePercent === null ||
			salesRatePercent === null ||
			contributionPerSale === null ||
			fixedCostMonthly === null
		) {
			return null;
		}

		const maxMonthlyBudget = parseMoneyInput(maxMonthlyBudgetText);
		const monthlyClickVolume = parseNumberInput(monthlyClickVolumeText);
		const targetSales = parseNumberInput(targetSalesText);
		const maxAdShareOfContributionPercent = parseNumberInput(maxAdShareText);

		return calculateAdSimulation({
			cpc,
			conversionRatePercent,
			salesRatePercent,
			contributionPerSale,
			fixedCostMonthly,
			...(maxMonthlyBudget !== null ? { maxMonthlyBudget } : {}),
			...(monthlyClickVolume !== null ? { monthlyClickVolume } : {}),
			...(targetSales !== null ? { targetSales } : {}),
			...(maxAdShareOfContributionPercent !== null ? { maxAdShareOfContributionPercent } : {})
		});
	});

	function trafficBadge(light: TrafficLight): {
		label: string;
		tone: 'danger' | 'warning' | 'success' | 'brand';
	} {
		switch (light) {
			case 'red':
				return { label: 'Kırmızı · zarar bölgesi', tone: 'danger' };
			case 'yellow':
				return { label: 'Sarı · kırılgan', tone: 'warning' };
			case 'green':
				return { label: 'Yeşil · sağlıklı', tone: 'success' };
			case 'dark_green':
				return { label: 'Koyu yeşil · güçlü', tone: 'brand' };
		}
	}
</script>

<svelte:head>
	<title>Simülatör · Pazarlama · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-5xl min-w-0">
	<PageHeader
		title="Simülatör"
		description="CPC ve funnel oranlarıyla satış başı maliyet, trafik ışığı ve ölçek tavanını hesaplayın."
	/>

	<div class="grid gap-4 lg:grid-cols-2">
		<section class="rounded-lg border border-border bg-surface p-5">
			<h2 class="mb-4 text-sm font-semibold text-text">Girdiler</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class={labelClass} for="as-cpc">CPC (TL)</label>
					<input
						id="as-cpc"
						class={fieldClass}
						bind:value={cpcText}
						inputmode="decimal"
						placeholder="250"
						autocomplete="off"
					/>
				</div>
				<div>
					<label class={labelClass} for="as-cvr">Dönüşüm oranı tık→lead (%)</label>
					<input
						id="as-cvr"
						class={fieldClass}
						bind:value={conversionRateText}
						inputmode="decimal"
						placeholder="5"
						autocomplete="off"
					/>
				</div>
				<div>
					<label class={labelClass} for="as-sales-rate">Satış oranı lead→satış (%)</label>
					<input
						id="as-sales-rate"
						class={fieldClass}
						bind:value={salesRateText}
						inputmode="decimal"
						placeholder="10"
						autocomplete="off"
					/>
				</div>
				<div>
					<label class={labelClass} for="as-contribution">Satış başı katkı (TL)</label>
					<input
						id="as-contribution"
						class={fieldClass}
						bind:value={contributionPerSaleText}
						inputmode="decimal"
						placeholder="100000"
						autocomplete="off"
					/>
				</div>
				<div class="sm:col-span-2">
					<label class={labelClass} for="as-fixed">Aylık sabit maliyet (TL)</label>
					<input
						id="as-fixed"
						class={fieldClass}
						bind:value={fixedCostMonthlyText}
						inputmode="decimal"
						placeholder="750000"
						autocomplete="off"
					/>
				</div>

				<div class="border-t border-border pt-3 sm:col-span-2">
					<p class="mb-3 text-xs font-medium text-text-muted">Opsiyonel ölçek / hedef</p>
					<div class="grid gap-3 sm:grid-cols-2">
						<div>
							<label class={labelClass} for="as-budget">Aylık maks bütçe (TL)</label>
							<input
								id="as-budget"
								class={fieldClass}
								bind:value={maxMonthlyBudgetText}
								inputmode="decimal"
								placeholder="1000000"
								autocomplete="off"
							/>
						</div>
						<div>
							<label class={labelClass} for="as-volume">Aylık tık hacmi (adet)</label>
							<input
								id="as-volume"
								class={fieldClass}
								bind:value={monthlyClickVolumeText}
								inputmode="numeric"
								placeholder="3000"
								autocomplete="off"
							/>
						</div>
						<div>
							<label class={labelClass} for="as-target">Hedef satış/ay (adet)</label>
							<input
								id="as-target"
								class={fieldClass}
								bind:value={targetSalesText}
								inputmode="decimal"
								placeholder="15"
								autocomplete="off"
							/>
						</div>
						<div>
							<label class={labelClass} for="as-share">Reklamın katkıdan max payı (%)</label>
							<input
								id="as-share"
								class={fieldClass}
								bind:value={maxAdShareText}
								inputmode="decimal"
								placeholder="50"
								autocomplete="off"
							/>
							<p class="mt-1 text-xs text-text-muted">Boş bırakılırsa %50</p>
						</div>
					</div>
				</div>
			</div>
		</section>

		<div class="space-y-4">
			{#if result}
				{@const badge = trafficBadge(result.trafficLight)}
				<section class="rounded-lg border border-border bg-surface p-5">
					<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
						<h2 class="text-sm font-semibold text-text">Huni + sağlık</h2>
						<StatusBadge label={badge.label} tone={badge.tone} />
					</div>
					<dl class="space-y-3 text-sm">
						<div class="flex items-baseline justify-between gap-3">
							<dt class="text-text-muted">Uçtan uca oran</dt>
							<dd class="font-medium text-text">{formatPercent(result.endToEndRate, 2)}</dd>
						</div>
						<div class="flex items-baseline justify-between gap-3">
							<dt class="text-text-muted">Satış başı tık</dt>
							<dd class="font-medium text-text">{formatCount(result.clicksPerSale, 0)}</dd>
						</div>
						<div class="flex items-baseline justify-between gap-3">
							<dt class="text-text-muted">Lead maliyeti</dt>
							<dd class="font-medium text-text">{formatMoneyOrDash(result.costPerLead)}</dd>
						</div>
						<div class="flex items-baseline justify-between gap-3">
							<dt class="text-text-muted">Satış başı reklam maliyeti</dt>
							<dd class="font-medium text-text">{formatMoneyOrDash(result.adCostPerSale)}</dd>
						</div>
						<div class="flex items-baseline justify-between gap-3">
							<dt class="text-text-muted">Reklam sonrası katkı</dt>
							<dd class="font-medium text-text">
								{formatMoneyOrDash(result.contributionAfterAds)}
							</dd>
						</div>
						<div class="flex items-baseline justify-between gap-3">
							<dt class="text-text-muted">Zarar eşiği</dt>
							<dd class="font-medium text-text">{formatPercent(result.lossThresholdRate, 2)}</dd>
						</div>
						<div class="flex items-baseline justify-between gap-3">
							<dt class="text-text-muted">Sağlıklı hedef oranı</dt>
							<dd class="font-medium text-text">{formatPercent(result.healthyTargetRate, 2)}</dd>
						</div>
						<div class="flex items-baseline justify-between gap-3">
							<dt class="text-text-muted">Uygulanabilir mi?</dt>
							<dd class="font-medium text-text">{result.isViable ? 'Evet' : 'Hayır'}</dd>
						</div>
						<div class="flex items-baseline justify-between gap-3 border-t border-border pt-3">
							<dt class="text-text-muted">Başabaş satış/ay</dt>
							<dd class="font-medium text-text">{formatCount(result.breakEvenSales, 1)}</dd>
						</div>
						<div class="flex items-baseline justify-between gap-3">
							<dt class="text-text-muted">Gerekli aylık bütçe</dt>
							<dd class="font-medium text-text">{formatMoneyOrDash(result.requiredBudget)}</dd>
						</div>
						<div class="flex items-baseline justify-between gap-3">
							<dt class="text-text-muted">Gerekli aylık tık</dt>
							<dd class="font-medium text-text">{formatCount(result.requiredMonthlyClicks, 0)}</dd>
						</div>
						<div class="flex items-baseline justify-between gap-3">
							<dt class="text-text-muted">Gerekli günlük tık</dt>
							<dd class="font-medium text-text">{formatCount(result.requiredDailyClicks, 0)}</dd>
						</div>
					</dl>
				</section>

				{#if result.scale}
					{@const scale = result.scale}
					<section class="rounded-lg border border-border bg-surface p-5">
						<h2 class="mb-4 text-sm font-semibold text-text">Ölçek</h2>
						<dl class="space-y-3 text-sm">
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Darboğaz</dt>
								<dd class="font-medium text-text">
									{scale.bottleneck === 'budget' ? 'Bütçe sınırı' : 'Hacim sınırı'}
								</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Maks. satış/ay</dt>
								<dd class="font-medium text-text">{formatCount(scale.maxSales, 0)}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Maks. aylık harcama</dt>
								<dd class="font-medium text-text">{formatMoney(scale.maxMonthlySpend)}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Maks’ta aylık kâr</dt>
								<dd class="font-medium text-text">{formatMoney(scale.monthlyProfitAtMax)}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Başabaş erişilebilir mi?</dt>
								<dd class="font-medium text-text">{scale.breakEvenReachable ? 'Evet' : 'Hayır'}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Bütçe tavanı (satış)</dt>
								<dd class="font-medium text-text">{formatCount(scale.budgetCapSales, 0)}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Hacim tavanı (satış)</dt>
								<dd class="font-medium text-text">{formatCount(scale.volumeCapSales, 0)}</dd>
							</div>
						</dl>
					</section>
				{/if}

				{#if result.target}
					{@const target = result.target}
					<section class="rounded-lg border border-border bg-surface p-5">
						<h2 class="mb-4 text-sm font-semibold text-text">Hedef planı</h2>
						{#if target.withinHealthyTarget}
							<p
								class="mb-4 rounded-[6px] border border-transparent bg-success/15 px-3 py-2 text-xs font-medium text-success"
							>
								Sağlıklı hedef içinde
							</p>
						{:else}
							<p
								class="mb-4 rounded-[6px] border border-transparent bg-warning/15 px-3 py-2 text-xs font-medium text-warning"
							>
								%{formatCount(target.adSharePercent, 0)} kuralı aşıldı
							</p>
						{/if}
						<dl class="space-y-3 text-sm">
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Hedef satış/ay</dt>
								<dd class="font-medium text-text">{formatCount(target.targetSales, 0)}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Gerekli lead/ay</dt>
								<dd class="font-medium text-text">{formatCount(target.requiredLeadsMonthly, 0)}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Gerekli tık/ay</dt>
								<dd class="font-medium text-text">
									{formatCount(target.requiredClicksMonthly, 0)}
								</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Gerekli tık/gün</dt>
								<dd class="font-medium text-text">{formatCount(target.requiredClicksDaily, 0)}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Gerekli bütçe/ay</dt>
								<dd class="font-medium text-text">{formatMoney(target.requiredBudgetMonthly)}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Gerekli bütçe/gün</dt>
								<dd class="font-medium text-text">{formatMoney(target.requiredBudgetDaily)}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Reklam maliyeti tavanı</dt>
								<dd class="font-medium text-text">{formatMoney(target.adCostCeiling)}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-text-muted">Katkı payı tavanı</dt>
								<dd class="font-medium text-text">%{formatCount(target.adSharePercent, 0)}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3 border-t border-border pt-3">
								<dt class="text-text-muted">Aylık net kâr</dt>
								<dd class="font-medium {target.monthlyProfit < 0 ? 'text-danger' : 'text-text'}">
									{formatMoney(target.monthlyProfit)}
								</dd>
							</div>
						</dl>
					</section>
				{/if}
			{:else}
				<section class="rounded-lg border border-border bg-surface p-5">
					<h2 class="mb-2 text-sm font-semibold text-text">Sonuç</h2>
					<p class="text-sm text-text-muted">
						Zorunlu alanları geçerli sayılarla doldurun; sonuç burada görünür.
					</p>
				</section>
			{/if}
		</div>
	</div>
</div>

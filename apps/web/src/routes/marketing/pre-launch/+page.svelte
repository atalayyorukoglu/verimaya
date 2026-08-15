<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import {
		calculateTruthMetrics,
		calculateTrustScore,
		scanLandingCopy,
		type ProfitStatus,
		type TrustScoreSettings
	} from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass, textareaClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatRatio, parseMoneyInput } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type CheckTone = 'ok' | 'fail' | 'pending';

	let copyText = $state('');
	let platformRoasText = $state('3,3');
	let salePriceText = $state('1000');
	let operationCostText = $state('400');
	let commissionText = $state('50');
	let platformExtraFeeText = $state('2');

	const qs = useQueryScope();

	const trustQuery = createQuery(() => ({
		queryKey: qs.keys.settings.trustScore(),
		queryFn: () => apiGet<TrustScoreSettings>('/v1/settings/trust-score'),
		enabled: qs.ready
	}));

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

	const compliance = $derived.by(() => {
		const trimmed = copyText.trim();
		if (!trimmed) return { tone: 'pending' as CheckTone, detail: 'Metin girin' };
		const scan = scanLandingCopy(trimmed);
		if (scan.ok) {
			return { tone: 'ok' as CheckTone, detail: 'Yasaklı ifade yok' };
		}
		const blocks = scan.hits.filter((h) => h.severity === 'block').length;
		return {
			tone: 'fail' as CheckTone,
			detail: `${blocks} yasaklı ifade`
		};
	});

	const economics = $derived.by(() => {
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
			return {
				tone: 'pending' as CheckTone,
				detail: 'Girdileri tamamlayın',
				realRoas: null as number | null,
				profitStatus: null as ProfitStatus | null
			};
		}

		const result = calculateTruthMetrics({
			platformRoas,
			salePrice,
			operationCost,
			commission,
			platformExtraFeePercent
		});

		const ok = result.profitStatus === 'profitable' || result.profitStatus === 'break_even';
		return {
			tone: (ok ? 'ok' : 'fail') as CheckTone,
			detail:
				result.profitStatus === 'profitable'
					? 'Kârlı'
					: result.profitStatus === 'break_even'
						? 'Başabaş'
						: 'Zarar',
			realRoas: result.realRoas,
			profitStatus: result.profitStatus
		};
	});

	const measurement = $derived.by(() => {
		if (trustQuery.isPending) {
			return {
				tone: 'pending' as CheckTone,
				detail: 'Yükleniyor…',
				score: null as number | null,
				grade: null as string | null,
				empty: false
			};
		}
		if (trustQuery.isError) {
			return {
				tone: 'fail' as CheckTone,
				detail: 'Ölçüm yüklenemedi',
				score: null as number | null,
				grade: null as string | null,
				empty: false
			};
		}

		const checks = trustQuery.data?.checks ?? [];
		if (checks.length === 0) {
			return {
				tone: 'fail' as CheckTone,
				detail: 'Kayıtlı checklist yok — Ölçüm’de kaydedin',
				score: null as number | null,
				grade: null as string | null,
				empty: true
			};
		}

		const result = calculateTrustScore(checks);
		const ok = result.score >= 60;
		return {
			tone: (ok ? 'ok' : 'fail') as CheckTone,
			detail: `Skor ${result.score} · not ${result.grade}`,
			score: result.score,
			grade: result.grade,
			empty: false
		};
	});

	const gaps = $derived.by(() => {
		const items: { label: string; href: string }[] = [];
		if (compliance.tone !== 'ok') {
			items.push({ label: 'Uyumluluk', href: '/marketing/compliance' });
		}
		if (economics.tone !== 'ok') {
			items.push({ label: 'Hesap', href: '/marketing/calculator' });
		}
		if (measurement.tone !== 'ok') {
			items.push({ label: 'Ölçüm', href: '/marketing/measurement' });
		}
		return items;
	});

	const allReady = $derived(
		compliance.tone === 'ok' && economics.tone === 'ok' && measurement.tone === 'ok'
	);

	const complianceBadge = $derived(toneBadge(compliance.tone));
	const economicsBadge = $derived(toneBadge(economics.tone));
	const measurementBadge = $derived(toneBadge(measurement.tone));

	function toneBadge(tone: CheckTone): { label: string; badge: 'success' | 'danger' | 'neutral' } {
		if (tone === 'ok') return { label: 'Geçti', badge: 'success' };
		if (tone === 'fail') return { label: 'Eksik', badge: 'danger' };
		return { label: 'Bekliyor', badge: 'neutral' };
	}

	function panelClass(tone: CheckTone): string {
		if (tone === 'ok') return 'border-success/40';
		if (tone === 'fail') return 'border-danger/40';
		return 'border-border';
	}
</script>

<svelte:head>
	<title>Yayın Öncesi · Pazarlama · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-5xl min-w-0">
	<PageHeader
		title="Yayın Öncesi Kontrol"
		description="Kampanyayı yayınlamadan önce uyumluluk, birim ekonomi ve ölçüm eşiğini kontrol edin. Bu bir uyarıdır, engel değil."
	/>

	{#if allReady}
		<div
			class="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
			role="status"
		>
			<p class="font-medium">Yayına hazır</p>
			<p class="mt-1 text-xs opacity-90">Üç kontrol de geçti. Bu bir uyarıdır, engel değil.</p>
		</div>
	{:else}
		<div
			class="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
			role="status"
		>
			<p class="font-medium">Yayın öncesi eksikler var</p>
			<p class="mt-1 text-xs opacity-90">Bu bir uyarıdır, engel değil.</p>
			{#if gaps.length > 0}
				<ul class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
					{#each gaps as gap (gap.href)}
						<li>
							<a href={gap.href} class="font-medium underline underline-offset-2 hover:opacity-80">
								{gap.label}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<div class="grid gap-4 lg:grid-cols-3">
		<section class="rounded-lg border bg-surface p-5 {panelClass(compliance.tone)}">
			<div class="mb-3 flex items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">Uyumluluk</h2>
				<StatusBadge label={complianceBadge.label} tone={complianceBadge.badge} />
			</div>
			<label class={labelClass} for="precheck-copy">Reklam / landing metni</label>
			<textarea
				id="precheck-copy"
				class={textareaClass}
				bind:value={copyText}
				rows={6}
				placeholder="Metni yapıştırın…"></textarea>
			<p class="mt-2 text-xs text-text-muted">{compliance.detail}</p>
			<a
				href="/marketing/compliance"
				class="mt-3 inline-block text-xs font-medium text-brand hover:underline"
			>
				Uyumluluk aracına git
			</a>
		</section>

		<section class="rounded-lg border bg-surface p-5 {panelClass(economics.tone)}">
			<div class="mb-3 flex items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">Birim ekonomi</h2>
				<StatusBadge label={economicsBadge.label} tone={economicsBadge.badge} />
			</div>
			<div class="grid gap-2">
				<div>
					<label class={labelClass} for="pc-roas">Platform ROAS</label>
					<input
						id="pc-roas"
						class={fieldClass}
						bind:value={platformRoasText}
						inputmode="decimal"
					/>
				</div>
				<div>
					<label class={labelClass} for="pc-sale">Satış fiyatı (TL)</label>
					<input id="pc-sale" class={fieldClass} bind:value={salePriceText} inputmode="decimal" />
				</div>
				<div>
					<label class={labelClass} for="pc-op">Operasyon (TL)</label>
					<input id="pc-op" class={fieldClass} bind:value={operationCostText} inputmode="decimal" />
				</div>
				<div>
					<label class={labelClass} for="pc-comm">Komisyon (TL)</label>
					<input id="pc-comm" class={fieldClass} bind:value={commissionText} inputmode="decimal" />
				</div>
				<div>
					<label class={labelClass} for="pc-fee">Ek ücret (%)</label>
					<input
						id="pc-fee"
						class={fieldClass}
						bind:value={platformExtraFeeText}
						inputmode="decimal"
					/>
				</div>
			</div>
			<p class="mt-2 text-xs text-text-muted">
				{economics.detail}
				{#if economics.realRoas != null}
					· Gerçek ROAS {formatRatio(economics.realRoas)}
				{/if}
			</p>
			<a
				href="/marketing/calculator"
				class="mt-3 inline-block text-xs font-medium text-brand hover:underline"
			>
				Hesap aracına git
			</a>
		</section>

		<section class="rounded-lg border bg-surface p-5 {panelClass(measurement.tone)}">
			<div class="mb-3 flex items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">Ölçüm eşiği</h2>
				<StatusBadge label={measurementBadge.label} tone={measurementBadge.badge} />
			</div>
			{#if measurement.empty}
				<p class="text-sm text-text-muted">
					Kayıtlı Trust Score yok. Ölçüm sayfasında checklist’i doldurup kaydedin.
				</p>
			{:else if measurement.score != null}
				<p class="text-3xl font-semibold tracking-tight text-text">{measurement.score}</p>
				<p class="mt-1 text-xs text-text-muted">
					Not {measurement.grade} · eşik ≥ 60 (C+)
				</p>
			{:else}
				<p class="text-sm text-text-muted">{measurement.detail}</p>
			{/if}
			<a
				href="/marketing/measurement"
				class="mt-3 inline-block text-xs font-medium text-brand hover:underline"
			>
				Ölçümü düzenle
			</a>
		</section>
	</div>
</div>

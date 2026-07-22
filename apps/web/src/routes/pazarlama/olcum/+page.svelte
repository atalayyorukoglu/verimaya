<script lang="ts">
	import {
		calculateTrustScore,
		type Grade,
		type TrustCheckId,
		type TrustScoreResult
	} from '@verimaya/shared';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { labelClass } from '$lib/api';

	type Maturity = 0 | 50 | 100;

	type CheckRow = {
		id: TrustCheckId;
		label: string;
		score: Maturity;
	};

	let checks = $state<CheckRow[]>([
		{ id: 'consent_mode', label: 'Consent Mode / KVKK rıza sinyali', score: 50 },
		{ id: 'enhanced_conversions', label: 'Gelişmiş dönüşümler / CAPI', score: 50 },
		{ id: 'server_side_tagging', label: 'Sunucu taraflı etiketleme (SST)', score: 0 },
		{ id: 'crm_feedback', label: 'CRM → Ads geri bildirimi (offline conversion)', score: 0 },
		{ id: 'emq_score', label: 'Eşleşme/lead kalitesi (EMQ)', score: 50 }
	]);

	const maturityOptions: { value: Maturity; label: string }[] = [
		{ value: 0, label: 'Yok' },
		{ value: 50, label: 'Kısmi' },
		{ value: 100, label: 'Tam' }
	];

	const result = $derived.by(
		(): TrustScoreResult =>
			calculateTrustScore(checks.map((c) => ({ id: c.id, score: c.score })))
	);

	const needsPriority = $derived(result.grade === 'F' || result.grade === 'D');

	function gradeTone(grade: Grade): 'success' | 'brand' | 'info' | 'warning' | 'danger' {
		switch (grade) {
			case 'A':
				return 'success';
			case 'B':
				return 'brand';
			case 'C':
				return 'info';
			case 'D':
				return 'warning';
			case 'F':
				return 'danger';
		}
	}

	function setScore(id: TrustCheckId, score: Maturity) {
		checks = checks.map((c) => (c.id === id ? { ...c, score } : c));
	}

	function labelForId(id: TrustCheckId): string {
		return checks.find((c) => c.id === id)?.label ?? id;
	}
</script>

<svelte:head>
	<title>Ölçüm · Pazarlama · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-5xl min-w-0">
	<PageHeader
		title="Ölçüm Olgunluğu"
		description="Veri/izleme kurulumunuzu puanlayın; zayıf halkaları görün. (Manuel değerlendirme; entegrasyon yok.)"
	/>

	<div class="grid gap-4 lg:grid-cols-2">
		<section class="rounded-lg border border-border bg-surface p-5">
			<h2 class="mb-4 text-sm font-semibold text-text">Kontroller</h2>
			<ul class="space-y-4">
				{#each checks as check (check.id)}
					<li class="border-b border-border pb-4 last:border-0 last:pb-0">
						<p class={labelClass}>{check.label}</p>
						<div class="mt-2 flex flex-wrap gap-2" role="group" aria-label={check.label}>
							{#each maturityOptions as opt (opt.value)}
								<button
									type="button"
									class="h-8 rounded-[6px] border px-3 text-xs font-medium transition-colors {check.score ===
									opt.value
										? 'border-brand bg-brand-subtle text-brand'
										: 'border-border bg-surface text-text-muted hover:bg-surface-2'}"
									onclick={() => setScore(check.id, opt.value)}
								>
									{opt.label}
								</button>
							{/each}
						</div>
					</li>
				{/each}
			</ul>
		</section>

		<section class="rounded-lg border border-border bg-surface p-5">
			<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">Sonuç</h2>
				<StatusBadge label="Not {result.grade}" tone={gradeTone(result.grade)} />
			</div>

			<p class="mb-1 text-3xl font-semibold tracking-tight text-text">{result.score}</p>
			<p class="mb-4 text-xs text-text-muted">Toplam skor (0–100)</p>

			{#if needsPriority}
				<p
					class="mb-4 rounded-[6px] border border-transparent bg-warning/15 px-3 py-2 text-xs font-medium text-warning"
				>
					Öncelikli iyileştirme — not D/F; zayıf halkaları güçlendirin.
				</p>
			{/if}

			<dl class="space-y-3 text-sm">
				{#each result.checks as row (row.id)}
					<div class="flex items-baseline justify-between gap-3">
						<dt class="min-w-0 text-text-muted">{labelForId(row.id)}</dt>
						<dd class="shrink-0 font-medium text-text">
							{row.score}
							<span class="font-normal text-text-muted">· katkı {row.weighted}</span>
						</dd>
					</div>
				{/each}
			</dl>
		</section>
	</div>
</div>

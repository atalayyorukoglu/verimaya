<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		calculateTrustScore,
		type Grade,
		type TrustCheckId,
		type TrustScoreResult,
		type TrustScoreSettings
	} from '@verimaya/shared';
	import { apiGet, apiSend, labelClass } from '$lib/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';

	type Maturity = 0 | 50 | 100;

	type CheckRow = {
		id: TrustCheckId;
		label: string;
		hint: string;
		score: Maturity;
	};

	const DEFAULT_CHECKS: CheckRow[] = [
		{
			id: 'consent_mode',
			label: 'Consent Mode / KVKK rıza sinyali',
			hint: 'KVKK/consent sinyali — rıza ve CMP durumunun ölçüm zincirine aktarılması.',
			score: 0
		},
		{
			id: 'enhanced_conversions',
			label: 'Gelişmiş dönüşümler / CAPI',
			hint: 'CAPI / gelişmiş dönüşüm — sunucu veya geliştirilmiş dönüşüm geri bildirimi.',
			score: 0
		},
		{
			id: 'server_side_tagging',
			label: 'Sunucu taraflı etiketleme (SST)',
			hint: 'SST — sunucu taraflı etiketleme / container kurulumu.',
			score: 0
		},
		{
			id: 'crm_feedback',
			label: 'CRM → Ads geri bildirimi (offline conversion)',
			hint: 'CRM→Ads offline conversion — kapalı/kazanılan lead’in reklam platformuna dönüşü.',
			score: 0
		},
		{
			id: 'emq_score',
			label: 'Eşleşme/lead kalitesi (EMQ)',
			hint: 'Lead / eşleşme kalitesi — Event Match Quality veya benzeri eşleşme skoru.',
			score: 0
		}
	];

	function asMaturity(score: number): Maturity {
		if (score >= 100) return 100;
		if (score >= 50) return 50;
		return 0;
	}

	function mergeSaved(saved: TrustScoreSettings | undefined): CheckRow[] {
		const byId = new Map((saved?.checks ?? []).map((c) => [c.id, c.score]));
		return DEFAULT_CHECKS.map((row) => ({
			...row,
			score: byId.has(row.id) ? asMaturity(byId.get(row.id)!) : 0
		}));
	}

	const queryClient = useQueryClient();

	const settingsQuery = createQuery(() => ({
		queryKey: ['settings', 'trust-score'],
		queryFn: () => apiGet<TrustScoreSettings>('/v1/settings/trust-score')
	}));

	let checks = $state<CheckRow[]>(mergeSaved(undefined));
	let hydrated = $state(false);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let saveOk = $state(false);

	$effect(() => {
		if (!settingsQuery.isSuccess || hydrated) return;
		checks = mergeSaved(settingsQuery.data);
		hydrated = true;
	});

	const maturityOptions: { value: Maturity; label: string }[] = [
		{ value: 0, label: 'Yok' },
		{ value: 50, label: 'Kısmi' },
		{ value: 100, label: 'Tam' }
	];

	const result = $derived.by((): TrustScoreResult =>
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
		saveOk = false;
	}

	function labelForId(id: TrustCheckId): string {
		return checks.find((c) => c.id === id)?.label ?? id;
	}

	async function save() {
		saving = true;
		saveError = null;
		saveOk = false;
		try {
			const body: TrustScoreSettings = {
				checks: checks.map((c) => ({ id: c.id, score: c.score }))
			};
			await apiSend<TrustScoreSettings>('/v1/settings/trust-score', 'PUT', body);
			await queryClient.invalidateQueries({ queryKey: ['settings', 'trust-score'] });
			saveOk = true;
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Kayıt başarısız';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Ölçüm · Pazarlama · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-5xl min-w-0">
	<PageHeader
		title="Ölçüm Olgunluğu"
		description="Veri/izleme kurulumunuzu puanlayın; tenant bazında kaydedilir. Zayıf halkaları görün."
	>
		{#snippet actions()}
			<Button
				type="button"
				size="sm"
				disabled={saving || settingsQuery.isPending}
				onclick={() => void save()}
			>
				{saving ? 'Kaydediliyor…' : 'Kaydet'}
			</Button>
		{/snippet}
	</PageHeader>

	{#if settingsQuery.isPending && !hydrated}
		<p class="mb-4 text-sm text-text-muted">Kayıtlı checklist yükleniyor…</p>
	{/if}
	{#if saveOk}
		<div
			class="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
			role="status"
		>
			Ölçüm checklist’i kaydedildi.
		</div>
	{/if}
	{#if saveError}
		<div class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
			{saveError}
		</div>
	{/if}

	<div class="grid gap-4 lg:grid-cols-2">
		<section class="rounded-lg border border-border bg-surface p-5">
			<h2 class="mb-4 text-sm font-semibold text-text">Kontroller</h2>
			<ul class="space-y-4">
				{#each checks as check (check.id)}
					<li class="border-b border-border pb-4 last:border-0 last:pb-0">
						<p class={labelClass}>{check.label}</p>
						<p class="mt-0.5 text-xs text-text-faint">{check.hint}</p>
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

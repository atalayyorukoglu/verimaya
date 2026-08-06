<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { AiCorrection, TransactionDraft } from '@verimaya/shared';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { USE_MSW } from '$lib/env';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';

	type CorrectionRow = { field: string; corrections: number; rate: string };
	type CorrectionsPage = { items: AiCorrection[]; next_cursor: string | null };

	const FIELD_ORDER = [
		'kind (gelir/gider)',
		'amount / currency',
		'category',
		'contact_label',
		'patient match',
		'occurred_on'
	] as const;

	/** Demo sabit veri — sadece MSW modunda gösterilir. */
	const DEMO_ROWS: CorrectionRow[] = [
		{ field: 'kind (gelir/gider)', corrections: 12, rate: '18%' },
		{ field: 'amount / currency', corrections: 9, rate: '14%' },
		{ field: 'category', corrections: 21, rate: '32%' },
		{ field: 'contact_label', corrections: 15, rate: '23%' },
		{ field: 'patient match', corrections: 7, rate: '11%' },
		{ field: 'occurred_on', corrections: 4, rate: '6%' }
	];

	const { keys, ready } = useQueryScope();

	const correctionsQuery = createQuery(() => ({
		queryKey: keys.whatsapp.corrections(),
		queryFn: () => apiGet<CorrectionsPage>(apiPaths.whatsappCorrectionsList({ limit: 100 })),
		enabled: !USE_MSW && ready
	}));

	function fieldDiffs(a: TransactionDraft, b: TransactionDraft): Record<string, boolean> {
		return {
			'kind (gelir/gider)': a.kind !== b.kind,
			'amount / currency': a.amount !== b.amount || a.currency !== b.currency,
			category: (a.category ?? null) !== (b.category ?? null),
			contact_label: (a.contact_label ?? null) !== (b.contact_label ?? null),
			'patient match': (a.patient_id ?? null) !== (b.patient_id ?? null),
			occurred_on: a.occurred_on !== b.occurred_on
		};
	}

	/** Kaydedilen her correction'ın original/corrected taslak çiftlerini kıyaslayıp alan bazlı sayım çıkarır. */
	function computeRows(items: AiCorrection[]): CorrectionRow[] {
		const counts: Record<string, number> = {};
		let totalRecords = 0;
		for (const item of items) {
			const len = Math.min(item.original_parsed.length, item.corrected.length);
			for (let i = 0; i < len; i++) {
				totalRecords++;
				const diffs = fieldDiffs(item.original_parsed[i]!, item.corrected[i]!);
				for (const [field, differs] of Object.entries(diffs)) {
					if (differs) counts[field] = (counts[field] ?? 0) + 1;
				}
			}
		}
		return FIELD_ORDER.map((field) => {
			const corrections = counts[field] ?? 0;
			const rate = totalRecords > 0 ? `${Math.round((corrections / totalRecords) * 100)}%` : '0%';
			return { field, corrections, rate };
		});
	}

	const rows = $derived(USE_MSW ? DEMO_ROWS : computeRows(correctionsQuery.data?.items ?? []));
	const totalCorrections = $derived(correctionsQuery.data?.items.length ?? 0);
</script>

<svelte:head>
	<title>AI öğrenme · Ayarlar · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title="AI öğrenme raporu"
		description={USE_MSW
			? 'Kullanıcının düzelttiği AI tahminleri — demo sabit veri.'
			: 'Kullanıcının düzelttiği AI tahminleri — kayıtlı correction verisinden hesaplanır.'}
	/>

	{#if !USE_MSW && correctionsQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if !USE_MSW && totalCorrections === 0}
		<p class="text-sm text-text-muted">Henüz correction kaydı yok.</p>
	{:else}
		<div class="overflow-hidden rounded-lg border border-border bg-surface">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
					<tr>
						<th class="px-4 py-2.5 font-medium">Alan</th>
						<th class="px-4 py-2.5 font-medium">Düzeltme</th>
						<th class="px-4 py-2.5 font-medium">Pay</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each rows as row (row.field)}
						<tr>
							<td class="px-4 py-2.5 font-medium text-text">{row.field}</td>
							<td class="px-4 py-2.5 text-text-muted tabular-nums">{row.corrections}</td>
							<td class="px-4 py-2.5 text-text-muted tabular-nums">{row.rate}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<p class="mt-3 text-xs text-text-faint">
		Faz 3: AI correction kaydı tutuluyor — AI ile İşlem ekranında kaydedilen/onaylanan taslaklar AI
		çıktısından farklıysa otomatik kaydedilir. En sık hata kategoride — prompt ve kategori sözlüğü
		iyileştirmesi için sinyal.
	</p>
</div>

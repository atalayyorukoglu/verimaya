<script lang="ts">
	import {
		DEFAULT_BANNED_TERMS,
		scanLandingCopy,
		type ComplianceScanResult
	} from '@verimaya/shared';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { labelClass, textareaClass } from '$lib/api';

	let text = $state('Tedavide kesin sonuç vaat ediyoruz. Mucize çözüm ile ücretsiz ön görüşme.');
	let termsOpen = $state(false);

	const result = $derived.by((): ComplianceScanResult | null => {
		const trimmed = text.trim();
		if (!trimmed) return null;
		return scanLandingCopy(trimmed);
	});

	const warnCount = $derived(result ? result.hits.filter((h) => h.severity === 'warn').length : 0);
</script>

<svelte:head>
	<title>Uyumluluk · Pazarlama · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-5xl min-w-0">
	<PageHeader
		title="Uyumluluk"
		description="Reklam/landing metnini yapıştırın; sağlık dikeyinde riskli ve yasaklı ifadeleri tarayın."
	/>

	<div class="grid gap-4 lg:grid-cols-2">
		<section class="rounded-lg border border-border bg-surface p-5">
			<h2 class="mb-4 text-sm font-semibold text-text">Metin</h2>
			<label class={labelClass} for="compliance-text">Reklam / landing kopyası</label>
			<textarea
				id="compliance-text"
				class={textareaClass}
				bind:value={text}
				rows={12}
				placeholder="Metni buraya yapıştırın…"></textarea>
		</section>

		<section class="rounded-lg border border-border bg-surface p-5">
			<h2 class="mb-4 text-sm font-semibold text-text">Tarama sonucu</h2>
			{#if result}
				<div class="mb-4 flex flex-wrap items-center gap-2">
					{#if result.ok}
						<StatusBadge label="Uygun" tone="success" />
					{:else}
						<StatusBadge label="Yasaklı ifade var" tone="danger" />
					{/if}
					{#if warnCount > 0}
						<StatusBadge label="{warnCount} uyarı" tone="warning" />
					{/if}
				</div>

				{#if result.hits.length === 0}
					<p class="text-sm text-text-muted">Bulgu yok</p>
				{:else}
					<ul class="space-y-2">
						{#each result.hits as hit, i (`${hit.term}-${hit.index}-${i}`)}
							<li
								class="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-border bg-surface-2/40 px-3 py-2 text-sm"
							>
								<div class="min-w-0">
									<p class="font-medium break-words text-text">“{hit.term}”</p>
									<p class="text-xs text-text-muted">karakter {hit.index}</p>
								</div>
								{#if hit.severity === 'block'}
									<StatusBadge label="Yasaklı" tone="danger" />
								{:else}
									<StatusBadge label="Uyarı" tone="warning" />
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			{:else}
				<p class="text-sm text-text-muted">Metin girildiğinde tarama sonucu burada görünür.</p>
			{/if}
		</section>
	</div>

	<section class="mt-4 rounded-lg border border-border bg-surface p-5">
		<button
			type="button"
			class="flex w-full items-center justify-between text-left text-sm font-semibold text-text"
			onclick={() => (termsOpen = !termsOpen)}
			aria-expanded={termsOpen}
		>
			<span>Taranan varsayılan terimler</span>
			<span class="text-xs font-normal text-text-muted">{termsOpen ? 'Gizle' : 'Göster'}</span>
		</button>
		{#if termsOpen}
			<ul class="mt-3 space-y-1.5 text-sm">
				{#each DEFAULT_BANNED_TERMS as term (term.term)}
					<li
						class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-1.5"
					>
						<span class="text-text">{term.term}</span>
						{#if term.severity === 'block'}
							<StatusBadge label="Yasaklı" tone="danger" />
						{:else}
							<StatusBadge label="Uyarı" tone="warning" />
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

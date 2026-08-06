<script lang="ts">
	import { buildUtmUrl, split322, split603010 } from '@verimaya/shared';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { fieldClass, labelClass } from '$lib/api';
	import { formatMoney, parseMoneyInput } from '$lib/format';

	let baseUrl = $state('example.com/lp');
	let campaign = $state('bahar');
	let source = $state('google');
	let medium = $state('cpc');
	let content = $state('');
	let term = $state('');
	let budgetText = $state('1000');
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	const utmUrl = $derived.by((): string | null => {
		const parts = {
			baseUrl: baseUrl.trim(),
			campaign: campaign.trim(),
			source: source.trim(),
			medium: medium.trim(),
			...(content.trim() ? { content: content.trim() } : {}),
			...(term.trim() ? { term: term.trim() } : {})
		};
		if (!parts.baseUrl || !parts.campaign || !parts.source || !parts.medium) return null;
		try {
			return buildUtmUrl(parts);
		} catch {
			return null;
		}
	});

	const budgetMinor = $derived(parseMoneyInput(budgetText));
	const split60 = $derived(budgetMinor !== null ? split603010(budgetMinor) : null);
	const splitCreative = $derived(budgetMinor !== null ? split322(budgetMinor) : null);

	async function copyUrl() {
		if (!utmUrl) return;
		try {
			await navigator.clipboard.writeText(utmUrl);
			copied = true;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			/* clipboard erişimi yoksa kullanıcı manuel kopyalar */
		}
	}
</script>

<svelte:head>
	<title>Şablonlar · Pazarlama · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-5xl min-w-0">
	<PageHeader title="Şablonlar" description="UTM linki ve bütçe dağıtım kalıpları." />

	<div class="space-y-4">
		<section class="rounded-lg border border-border bg-surface p-5">
			<h2 class="mb-4 text-sm font-semibold text-text">UTM oluşturucu</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="sm:col-span-2">
					<label class={labelClass} for="utm-base">Base URL</label>
					<input
						id="utm-base"
						class={fieldClass}
						bind:value={baseUrl}
						placeholder="example.com/lp"
						autocomplete="off"
					/>
				</div>
				<div>
					<label class={labelClass} for="utm-campaign">Campaign</label>
					<input
						id="utm-campaign"
						class={fieldClass}
						bind:value={campaign}
						placeholder="bahar"
						autocomplete="off"
					/>
				</div>
				<div>
					<label class={labelClass} for="utm-source">Source</label>
					<input
						id="utm-source"
						class={fieldClass}
						bind:value={source}
						placeholder="google"
						autocomplete="off"
					/>
				</div>
				<div>
					<label class={labelClass} for="utm-medium">Medium</label>
					<input
						id="utm-medium"
						class={fieldClass}
						bind:value={medium}
						placeholder="cpc"
						autocomplete="off"
					/>
				</div>
				<div>
					<label class={labelClass} for="utm-content">Content (opsiyonel)</label>
					<input
						id="utm-content"
						class={fieldClass}
						bind:value={content}
						placeholder="creative-a"
						autocomplete="off"
					/>
				</div>
				<div class="sm:col-span-2">
					<label class={labelClass} for="utm-term">Term (opsiyonel)</label>
					<input
						id="utm-term"
						class={fieldClass}
						bind:value={term}
						placeholder="sac-ekimi"
						autocomplete="off"
					/>
				</div>
			</div>

			<div class="mt-4 rounded-[6px] border border-border bg-surface-2/40 p-3">
				{#if utmUrl}
					<p class="font-mono text-xs leading-relaxed break-all text-text">{utmUrl}</p>
					<div class="mt-3">
						<Button type="button" size="sm" variant="outline" onclick={copyUrl}>
							{copied ? 'Kopyalandı' : 'Kopyala'}
						</Button>
					</div>
				{:else}
					<p class="text-sm text-text-muted">
						Zorunlu alanları (URL, campaign, source, medium) doldurun; link burada oluşur.
					</p>
				{/if}
			</div>
		</section>

		<section class="rounded-lg border border-border bg-surface p-5">
			<h2 class="mb-4 text-sm font-semibold text-text">Bütçe dağıtımı</h2>
			<div class="mb-4 max-w-xs">
				<label class={labelClass} for="tpl-budget">Bütçe (TL)</label>
				<input
					id="tpl-budget"
					class={fieldClass}
					bind:value={budgetText}
					inputmode="decimal"
					placeholder="1000"
					autocomplete="off"
				/>
			</div>

			{#if split60 && splitCreative}
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="rounded-[6px] border border-border bg-surface-2/40 p-4">
						<h3 class="mb-3 text-xs font-semibold tracking-wider text-text-muted uppercase">
							60 / 30 / 10
						</h3>
						<dl class="space-y-2 text-sm">
							<div class="flex justify-between gap-3">
								<dt class="text-text-muted">Prospecting</dt>
								<dd class="font-medium text-text">{formatMoney(split60.prospecting)}</dd>
							</div>
							<div class="flex justify-between gap-3">
								<dt class="text-text-muted">Remarketing</dt>
								<dd class="font-medium text-text">{formatMoney(split60.remarketing)}</dd>
							</div>
							<div class="flex justify-between gap-3">
								<dt class="text-text-muted">Test</dt>
								<dd class="font-medium text-text">{formatMoney(split60.testing)}</dd>
							</div>
						</dl>
					</div>
					<div class="rounded-[6px] border border-border bg-surface-2/40 p-4">
						<h3 class="mb-3 text-xs font-semibold tracking-wider text-text-muted uppercase">
							3 : 2 : 2 kreatif
						</h3>
						<dl class="space-y-2 text-sm">
							<div class="flex justify-between gap-3">
								<dt class="text-text-muted">A</dt>
								<dd class="font-medium text-text">{formatMoney(splitCreative.a)}</dd>
							</div>
							<div class="flex justify-between gap-3">
								<dt class="text-text-muted">B</dt>
								<dd class="font-medium text-text">{formatMoney(splitCreative.b)}</dd>
							</div>
							<div class="flex justify-between gap-3">
								<dt class="text-text-muted">C</dt>
								<dd class="font-medium text-text">{formatMoney(splitCreative.c)}</dd>
							</div>
						</dl>
					</div>
				</div>
			{:else}
				<p class="text-sm text-text-muted">
					Geçerli bir bütçe girildiğinde dağılım burada görünür.
				</p>
			{/if}
		</section>
	</div>
</div>

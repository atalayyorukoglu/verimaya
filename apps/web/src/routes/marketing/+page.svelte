<script lang="ts">
	import type { Component } from 'svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Calculator from '@lucide/svelte/icons/calculator';
	import FlaskConical from '@lucide/svelte/icons/flask-conical';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import LayoutTemplate from '@lucide/svelte/icons/layout-template';
	import Gauge from '@lucide/svelte/icons/gauge';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';

	type ToolCard = {
		href: string;
		title: string;
		description: string;
		icon: Component;
	};

	const tools: ToolCard[] = [
		{
			href: '/marketing/calculator',
			title: 'Hesap',
			description: 'Platform ROAS’tan gerçek kâr, başabaş ve reklam tavanı.',
			icon: Calculator
		},
		{
			href: '/marketing/simulator',
			title: 'Simülatör',
			description: 'CPC ve funnel oranlarıyla satış başı maliyet ve ölçek.',
			icon: FlaskConical
		},
		{
			href: '/marketing/compliance',
			title: 'Uyumluluk',
			description: 'Reklam / landing metninde yasaklı sağlık vaatlerini tara.',
			icon: ShieldCheck
		},
		{
			href: '/marketing/templates',
			title: 'Şablonlar',
			description: 'UTM linki, 3:2:2 kreatif ve 60/30/10 bütçe bölüşümü.',
			icon: LayoutTemplate
		},
		{
			href: '/marketing/measurement',
			title: 'Ölçüm',
			description: 'Consent, CAPI ve CRM geri bildirimiyle Trust Score.',
			icon: Gauge
		},
		{
			href: '/marketing/pre-launch',
			title: 'Yayın Öncesi',
			description: 'Uyumluluk, birim ekonomi ve ölçüm eşiğini tek ekranda kontrol et.',
			icon: ClipboardCheck
		}
	];
</script>

<svelte:head>
	<title>Pazarlama · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader
		title="Pazarlama"
		description="Reklam bütçenizin gerçek kâr matematiği, uyumluluk ve ölçüm araçları."
	/>

	<ul class="grid gap-3 sm:grid-cols-2">
		{#each tools as tool (tool.href)}
			{@const Icon = tool.icon}
			<li class="flex min-h-0">
				<a
					href={tool.href}
					class="flex h-full w-full items-start gap-3 rounded-lg border border-border bg-surface p-5 transition-colors hover:bg-surface-2"
				>
					<Icon class="mt-0.5 size-4 shrink-0 text-text-muted" />
					<div class="min-w-0 flex-1">
						<h2 class="font-medium text-text">{tool.title}</h2>
						<p class="mt-0.5 text-sm text-text-muted">{tool.description}</p>
					</div>
				</a>
			</li>
		{/each}
	</ul>
</div>

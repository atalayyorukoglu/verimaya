<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { focusTrap } from '$lib/actions/focus-trap';
	import { portal } from '$lib/actions/portal';
	import { t } from '$lib/i18n/locale.svelte';
	import { helpContent, type HelpTopic } from '$lib/help-content';

	let {
		open = $bindable(false),
		topic
	}: {
		open?: boolean;
		topic: HelpTopic;
	} = $props();

	const titleId = crypto.randomUUID();
	const content = $derived(helpContent[topic]);

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) open = false;
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<!--
		Mobil: tam ekran (inset-0, köşe yuvarlaması yok) — telefonda okunacağı için
		küçük bir kutuya sıkıştırmak yerine sayfayı kaplar.
		Masaüstü: ortalanmış, sınırlı genişlikte pencere.
	-->
	<div use:portal class="fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-4">
		<div
			role="presentation"
			class="absolute inset-0 bg-black/60"
			onclick={() => (open = false)}
		></div>
		<div
			use:focusTrap
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			tabindex="-1"
			class="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden bg-surface sm:max-h-[85dvh] sm:max-w-lg sm:flex-none sm:rounded-[8px] sm:border sm:border-border"
		>
			<div class="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
				<h2 id={titleId} class="text-base font-semibold text-text">
					{t(content.titleKey)}
				</h2>
				<button
					type="button"
					class="-mr-1.5 shrink-0 rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
					aria-label={t('common.close')}
					onclick={() => (open = false)}
				>
					<X class="size-5" />
				</button>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
				<div class="flex flex-col gap-3 text-sm leading-relaxed text-text">
					{#each content.bodyKeys as key (key)}
						<p>{t(key)}</p>
					{/each}
				</div>

				<div class="mt-4 rounded-[8px] border border-border bg-surface-2 p-3">
					<p class="text-xs font-medium tracking-wide text-text-faint uppercase">
						{t('help.exampleLabel')}
					</p>
					<p class="mt-1.5 text-sm leading-relaxed text-text">{t(content.exampleKey)}</p>
				</div>

				{#if content.caveatKey}
					<p class="mt-4 border-l-2 border-warning pl-3 text-sm leading-relaxed text-text-muted">
						{t(content.caveatKey)}
					</p>
				{/if}
			</div>
		</div>
	</div>
{/if}

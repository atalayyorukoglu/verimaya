<script lang="ts">
	import { page } from '$app/state';
	import MayaAiChat from '$lib/components/MayaAiChat.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	let open = $state(false);

	const hidden = $derived(page.url.pathname.startsWith('/maya'));

	function close() {
		open = false;
	}

	function toggle() {
		open = !open;
	}
</script>

<!--
	Mobilde gizli (2026-09-03, kullanıcı): `bottom-20 right-4` konumu kişi kartındaki
	akışın gönder düğmesinin tam üstüne biniyordu ve mesaj yazmayı engelliyordu.
	Maya mobilde alt menüden ve `/maya` sayfasından erişilebilir durumda; kalıcı çözüm
	(konumu kaydırmak / klavye açıkken gizlemek) ayrı bir iş.
-->
<!-- `contents` + `hidden` ikisi de display'i kurar, sırayla çakışırlar; yalnız gizleme kuralı. -->
<div class="max-md:hidden">
	{#if !hidden}
		{#if open}
			<div
				class="fixed right-4 bottom-20 z-40 flex h-[min(70vh,560px)] w-[min(100%-2rem,380px)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg md:bottom-6"
				role="dialog"
				aria-label={t('maya.title')}
			>
				<MayaAiChat variant="drawer" onRequestClose={close} />
			</div>
		{:else}
			<Button
				type="button"
				size="icon"
				class="fixed right-4 bottom-20 z-40 size-12 rounded-full shadow-lg md:bottom-6"
				onclick={toggle}
				aria-label={t('maya.fabLabel')}
			>
				<Sparkles class="size-5" />
				<span class="sr-only">{t('maya.fabLabel')}</span>
			</Button>
		{/if}
	{/if}
</div>

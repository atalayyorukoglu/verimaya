<script lang="ts">
	import { t } from '$lib/i18n/locale.svelte';
	import { messages, type MessageKey } from '$lib/i18n/messages';

	let { key }: { key: MessageKey } = $props();
</script>

<span data-i18n-tr={messages.tr[key]} data-i18n-en={messages.en[key]}>{t(key)}</span>

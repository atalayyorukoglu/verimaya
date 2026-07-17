<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';

	let {
		title,
		description = 'Bu ekran Faz 0a iskeletinde yer tutucu.'
	}: {
		title: string;
		description?: string;
	} = $props();
</script>

<div class="mx-auto max-w-3xl">
	<PageHeader {title} {description} />
	<div class="border-border bg-surface rounded-lg border p-8 text-center">
		<p class="text-text-muted text-sm">Yakında.</p>
	</div>
</div>

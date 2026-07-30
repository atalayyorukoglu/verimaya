<script lang="ts">
	let { href = '/settings', label = 'Ayarlar' }: { href?: string; label?: string } = $props();
</script>

<a href={href} class="mb-4 inline-flex items-center gap-1 text-sm text-info hover:underline">
	← {label}
</a>

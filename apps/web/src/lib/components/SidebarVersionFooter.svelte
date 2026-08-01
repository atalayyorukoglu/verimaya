<script lang="ts">
	import { changelog } from '@verimaya/shared';
	import BrandMark from '$lib/components/BrandMark.svelte';

	/** TickPort SidebarVersionFooter — centered xs muted line. docs/TASARIM.md */
	const version = $derived(changelog[0]?.version ?? '0.1.0');
</script>

<div class="flex w-full items-center justify-center gap-1 text-xs text-text-muted">
	<BrandMark class="h-4 w-4 text-text" title="" />
	<span>Verimaya · v{version}</span>
</div>

<script lang="ts">
	import { changelog } from '@verimaya/shared';
	import BrandMark from '$lib/components/BrandMark.svelte';

	/** TickPort SidebarVersionFooter — centered xs muted line. docs/TASARIM.md */
	const version = $derived(changelog[0]?.version ?? '0.1.0');
</script>

<div class="flex w-full items-center justify-center gap-1 text-xs text-text-muted">
	<BrandMark class="h-6 w-6 shrink-0 text-text" title="" />
	<span>Veri Maya · v{version}</span>
</div>

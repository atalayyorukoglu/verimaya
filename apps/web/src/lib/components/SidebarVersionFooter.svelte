<script lang="ts">
	import { changelog } from '@verimaya/shared';

	/** TickPort SidebarVersionFooter — centered xs muted line. docs/TASARIM.md */
	const version = $derived(changelog[0]?.version ?? '0.1.0');
</script>

<div class="flex w-full items-center justify-center text-xs text-text-muted">
	<span>Veri Maya · v{version}</span>
</div>

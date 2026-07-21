<script lang="ts">
	import { changelog } from '@verimaya/shared';

	/** TickPort SidebarVersionFooter — centered xs muted line. docs/TASARIM.md */
	const version = $derived(changelog[0]?.version ?? '0.1.0');
</script>

<div class="flex w-full items-center justify-center gap-0.5 text-xs text-text-muted">
	<span
		class="flex h-3 w-3 shrink-0 items-center justify-center text-[9px] font-bold leading-none text-text"
		aria-hidden="true"
	>
		V
	</span>
	<span>Verimaya · v{version}</span>
</div>

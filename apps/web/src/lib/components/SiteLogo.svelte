<script lang="ts">
	import { cn } from '$lib/utils';

	/**
	 * TickPort SiteLogo spacing/typography (gap-1, title sm/semibold, subtitle 11px -mt-1.5).
	 * docs/TASARIM.md — sidebar header.
	 */
	let {
		name = 'Verimaya',
		description = 'Demo Klinik',
		class: className,
		showText = true,
		centered = false
	}: {
		name?: string;
		description?: string;
		class?: string;
		showText?: boolean;
		centered?: boolean;
	} = $props();
</script>

<div
	class={cn(
		'flex min-w-0',
		centered ? 'flex-col items-center gap-1' : 'items-center gap-1',
		className
	)}
>
	<div class="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
		<span class="text-base leading-none font-semibold text-text">V</span>
	</div>
	{#if showText}
		<div
			class={cn(
				'flex min-w-0 flex-col justify-center gap-0.5',
				centered && 'items-center text-center'
			)}
		>
			<span class="flex min-w-0 items-center gap-1.5">
				<span class="truncate text-sm font-semibold text-text">{name}</span>
			</span>
			<span class="-mt-1.5 truncate text-[11px] font-normal text-text-muted">
				{description}
			</span>
		</div>
	{/if}
</div>

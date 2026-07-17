<script lang="ts">
	import { cn } from '$lib/utils';

	type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

	let {
		label,
		tone = 'neutral'
	}: {
		label: string;
		tone?: Tone;
	} = $props();

	const tones: Record<Tone, string> = {
		neutral: 'bg-surface-2 text-text-muted border-border',
		brand: 'bg-brand-subtle text-brand border-transparent',
		success: 'bg-success/15 text-success border-transparent',
		warning: 'bg-warning/15 text-warning border-transparent',
		danger: 'bg-danger/15 text-danger border-transparent',
		info: 'bg-info/15 text-info border-transparent'
	};
</script>

<span
	class={cn(
		'inline-flex items-center rounded-[6px] border px-2 py-0.5 text-xs font-medium',
		tones[tone]
	)}
>
	{label}
</span>

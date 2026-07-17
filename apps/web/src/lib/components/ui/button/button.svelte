<script lang="ts">
	import { cn } from '$lib/utils';
	import { type VariantProps, tv } from 'tailwind-variants';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	const buttonVariants = tv({
		base: 'inline-flex items-center justify-center gap-2 rounded-[6px] text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
		variants: {
			variant: {
				default: 'bg-brand text-primary-foreground hover:bg-brand-hover',
				secondary: 'bg-surface-2 text-text hover:bg-border',
				outline: 'border-border text-text hover:bg-surface-2 border bg-transparent',
				ghost: 'text-text-muted hover:bg-surface-2 hover:text-text',
				destructive: 'bg-danger text-text hover:opacity-90'
			},
			size: {
				default: 'h-9 px-4 py-2',
				sm: 'h-8 px-3 text-xs',
				lg: 'h-10 px-6',
				icon: 'size-9'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	type Props = HTMLButtonAttributes & {
		variant?: ButtonVariant;
		size?: ButtonSize;
		children?: Snippet;
	};

	let {
		class: className,
		variant = 'default',
		size = 'default',
		type = 'button',
		children,
		...restProps
	}: Props = $props();
</script>

<button
	{type}
	class={cn(buttonVariants({ variant, size }), className)}
	{...restProps}
>
	{@render children?.()}
</button>

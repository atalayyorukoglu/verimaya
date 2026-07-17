<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import { mobileTabItems, navGroups } from '$lib/navigation';
	import { canSeeNav, getDemoRole } from '$lib/rbac';
	import Bell from '@lucide/svelte/icons/bell';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import { changelog } from '@verimaya/shared';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	let mobileOpen = $state(false);
	let role = $state(getDemoRole());
	let hasUnreadChangelog = $state(false);

	const pathname = $derived(page.url.pathname);

	const visibleGroups = $derived(
		navGroups
			.map((group) => ({
				...group,
				items: group.items.filter((item) => canSeeNav(item.href, role))
			}))
			.filter((group) => group.items.length > 0)
	);

	const visibleTabs = $derived(mobileTabItems.filter((item) => canSeeNav(item.href, role)));

	$effect(() => {
		const latest = changelog[0]?.version;
		if (!latest) {
			hasUnreadChangelog = false;
			return;
		}
		hasUnreadChangelog = localStorage.getItem('verimaya:last-seen-version') !== latest;
	});

	function isActive(href: string): boolean {
		if (href === '/') return pathname === '/';
		return pathname === href || pathname.startsWith(`${href}/`);
	}

	function closeMobile() {
		mobileOpen = false;
	}
</script>

<div class="flex min-h-dvh w-full bg-bg text-text">
	<!-- Desktop sidebar: outer stretches with page; inner sticky fills viewport -->
	<aside class="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
		<div class="sticky top-0 flex h-dvh flex-col">
			<div class="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
				<span
					class="flex size-7 items-center justify-center rounded-[6px] bg-brand text-sm font-semibold text-primary-foreground"
					aria-hidden="true"
				>
					V
				</span>
				<div class="min-w-0">
					<p class="truncate text-sm font-semibold tracking-tight">Verimaya</p>
					<p class="truncate text-xs text-text-muted">Demo Klinik</p>
				</div>
			</div>

			<nav class="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Ana menü">
				{#each visibleGroups as group (group.label)}
					<div class="mb-4">
						<p
							class="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-text-faint uppercase"
						>
							{group.label}
						</p>
						<ul class="space-y-0.5">
							{#each group.items as item (item.href)}
								{@const active = isActive(item.href)}
								{@const Icon = item.icon}
								<li>
									<a
										href={item.href}
										class={cn(
											'relative flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-sm transition-colors',
											active
												? 'bg-brand-subtle font-medium text-brand'
												: 'text-text-muted hover:bg-surface-2 hover:text-text'
										)}
										aria-current={active ? 'page' : undefined}
									>
										{#if active}
											<span
												class="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r bg-brand"
												aria-hidden="true"
											></span>
										{/if}
										<Icon class="size-4 shrink-0" aria-hidden="true" />
										<span class="truncate">{item.label}</span>
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</nav>
			<div class="shrink-0 border-t border-border px-2 py-2">
				<a
					href="/ozellikler"
					class={cn(
						'flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-sm transition-colors',
						isActive('/ozellikler')
							? 'bg-brand-subtle font-medium text-brand'
							: 'text-text-muted hover:bg-surface-2 hover:text-text'
					)}
				>
					Özellikler
				</a>
			</div>
		</div>
	</aside>

	<!-- Mobile drawer (Menü sekmesi) -->
	{#if mobileOpen}
		<button
			type="button"
			class="fixed inset-0 z-40 bg-black/60 md:hidden"
			aria-label="Menüyü kapat"
			onclick={closeMobile}
		></button>
		<aside
			class="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-surface md:hidden"
		>
			<div class="flex h-14 items-center justify-between border-b border-border px-4">
				<div class="flex items-center gap-2.5">
					<span
						class="flex size-7 items-center justify-center rounded-[6px] bg-brand text-sm font-semibold text-primary-foreground"
						aria-hidden="true"
					>
						V
					</span>
					<span class="text-sm font-semibold">Verimaya</span>
				</div>
				<button
					type="button"
					class="rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-text"
					aria-label="Kapat"
					onclick={closeMobile}
				>
					<X class="size-5" />
				</button>
			</div>
			<nav class="flex-1 overflow-y-auto px-2 py-3" aria-label="Tüm menü">
				{#each visibleGroups as group (group.label)}
					<div class="mb-4">
						<p
							class="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-text-faint uppercase"
						>
							{group.label}
						</p>
						<ul class="space-y-0.5">
							{#each group.items as item (item.href)}
								{@const active = isActive(item.href)}
								{@const Icon = item.icon}
								<li>
									<a
										href={item.href}
										onclick={closeMobile}
										class={cn(
											'relative flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-sm transition-colors',
											active
												? 'bg-brand-subtle font-medium text-brand'
												: 'text-text-muted hover:bg-surface-2 hover:text-text'
										)}
										aria-current={active ? 'page' : undefined}
									>
										{#if active}
											<span
												class="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r bg-brand"
												aria-hidden="true"
											></span>
										{/if}
										<Icon class="size-4 shrink-0" aria-hidden="true" />
										<span class="truncate">{item.label}</span>
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</nav>
			<div class="shrink-0 border-t border-border px-2 py-2">
				<a
					href="/ozellikler"
					onclick={closeMobile}
					class={cn(
						'flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-sm transition-colors',
						isActive('/ozellikler')
							? 'bg-brand-subtle font-medium text-brand'
							: 'text-text-muted hover:bg-surface-2 hover:text-text'
					)}
				>
					Özellikler
				</a>
			</div>
		</aside>
	{/if}

	<div class="flex min-w-0 flex-1 flex-col">
		<header
			class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/95 px-3 backdrop-blur sm:px-4"
		>
			<CommandPalette />

			<div class="ml-auto flex shrink-0 items-center gap-1">
				<ThemeToggle />
				<a
					href="/yenilikler"
					class="relative rounded-[6px] p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
					aria-label="Yenilikler"
					title="Yenilikler"
				>
					<Bell class="size-5" />
					{#if hasUnreadChangelog}
						<span class="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand" aria-hidden="true"
						></span>
					{/if}
				</a>
				<button
					type="button"
					class="hidden rounded-[6px] p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text sm:inline-flex"
					aria-label="Destek"
					title="Destek"
				>
					<CircleHelp class="size-5" />
				</button>
				<button
					type="button"
					class="ml-1 flex size-8 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-semibold text-text"
					aria-label="Hesap menüsü"
				>
					PF
				</button>
			</div>
		</header>

		<main
			class="min-w-0 flex-1 overflow-x-hidden p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:p-6 md:pb-6"
		>
			{@render children()}
		</main>
	</div>

	<!-- Mobile bottom tabs -->
	<nav
		class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden"
		style="padding-bottom: env(safe-area-inset-bottom)"
		aria-label="Alt menü"
	>
		<ul class="flex h-14">
			{#each visibleTabs as item (item.href)}
				{@const active = isActive(item.href)}
				{@const Icon = item.icon}
				<li class="min-w-0 flex-1">
					<a
						href={item.href}
						class={cn(
							'flex h-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors',
							active ? 'text-brand' : 'text-text-muted'
						)}
						aria-current={active ? 'page' : undefined}
					>
						<Icon class="size-5 shrink-0" aria-hidden="true" />
						<span class="truncate">{item.label}</span>
					</a>
				</li>
			{/each}
			<li class="min-w-0 flex-1">
				<button
					type="button"
					class={cn(
						'flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors',
						mobileOpen ? 'text-brand' : 'text-text-muted'
					)}
					aria-label="Menü"
					aria-expanded={mobileOpen}
					onclick={() => (mobileOpen = !mobileOpen)}
				>
					<Menu class="size-5 shrink-0" aria-hidden="true" />
					<span>Menü</span>
				</button>
			</li>
		</ul>
	</nav>
</div>

<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import { navGroups } from '$lib/navigation';
	import Search from '@lucide/svelte/icons/search';
	import Bell from '@lucide/svelte/icons/bell';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	let mobileOpen = $state(false);

	const pathname = $derived(page.url.pathname);

	function isActive(href: string): boolean {
		if (href === '/') return pathname === '/';
		return pathname === href || pathname.startsWith(`${href}/`);
	}

	function closeMobile() {
		mobileOpen = false;
	}
</script>

<div class="bg-bg text-text flex min-h-dvh">
	<!-- Desktop sidebar -->
	<aside
		class="border-border bg-surface sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r md:flex"
	>
		<div class="border-border flex h-14 items-center gap-2.5 border-b px-4">
			<span
				class="bg-brand text-primary-foreground flex size-7 items-center justify-center rounded-[6px] text-sm font-semibold"
				aria-hidden="true"
			>
				V
			</span>
			<div class="min-w-0">
				<p class="truncate text-sm font-semibold tracking-tight">Verimaya</p>
				<p class="text-text-muted truncate text-xs">Demo Klinik</p>
			</div>
		</div>

		<nav class="flex-1 overflow-y-auto px-2 py-3" aria-label="Ana menü">
			{#each navGroups as group (group.label)}
				<div class="mb-4">
					<p
						class="text-text-faint px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider uppercase"
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
											? 'bg-brand-subtle text-brand font-medium'
											: 'text-text-muted hover:bg-surface-2 hover:text-text'
									)}
									aria-current={active ? 'page' : undefined}
								>
									{#if active}
										<span
											class="bg-brand absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r"
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
	</aside>

	<!-- Mobile drawer -->
	{#if mobileOpen}
		<button
			type="button"
			class="fixed inset-0 z-40 bg-black/60 md:hidden"
			aria-label="Menüyü kapat"
			onclick={closeMobile}
		></button>
		<aside
			class="border-border bg-surface fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r md:hidden"
		>
			<div class="border-border flex h-14 items-center justify-between border-b px-4">
				<div class="flex items-center gap-2.5">
					<span
						class="bg-brand text-primary-foreground flex size-7 items-center justify-center rounded-[6px] text-sm font-semibold"
						aria-hidden="true"
					>
						V
					</span>
					<span class="text-sm font-semibold">Verimaya</span>
				</div>
				<button
					type="button"
					class="text-text-muted hover:bg-surface-2 hover:text-text rounded-[6px] p-1.5"
					aria-label="Kapat"
					onclick={closeMobile}
				>
					<X class="size-5" />
				</button>
			</div>
			<nav class="flex-1 overflow-y-auto px-2 py-3" aria-label="Ana menü">
				{#each navGroups as group (group.label)}
					<div class="mb-4">
						<p
							class="text-text-faint px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider uppercase"
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
												? 'bg-brand-subtle text-brand font-medium'
												: 'text-text-muted hover:bg-surface-2 hover:text-text'
										)}
										aria-current={active ? 'page' : undefined}
									>
										{#if active}
											<span
												class="bg-brand absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r"
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
		</aside>
	{/if}

	<div class="flex min-w-0 flex-1 flex-col">
		<header
			class="border-border bg-bg/95 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-3 backdrop-blur sm:px-4"
		>
			<button
				type="button"
				class="text-text-muted hover:bg-surface-2 hover:text-text rounded-[6px] p-2 md:hidden"
				aria-label="Menüyü aç"
				onclick={() => (mobileOpen = true)}
			>
				<Menu class="size-5" />
			</button>

			<button
				type="button"
				class="border-border bg-surface text-text-faint hover:border-text-faint hover:text-text-muted flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[6px] border px-3 text-left text-sm transition-colors md:max-w-xl"
				aria-label="Ara"
			>
				<Search class="size-4 shrink-0" aria-hidden="true" />
				<span class="truncate">Hasta, randevu veya işlem ara…</span>
				<kbd
					class="border-border bg-surface-2 text-text-faint ml-auto hidden items-center rounded border px-1.5 py-0.5 font-mono text-[11px] sm:inline-flex"
				>
					⌘K
				</kbd>
			</button>

			<div class="ml-auto flex shrink-0 items-center gap-1">
				<a
					href="/yenilikler"
					class="text-text-muted hover:bg-surface-2 hover:text-text relative rounded-[6px] p-2 transition-colors"
					aria-label="Yenilikler"
					title="Yenilikler"
				>
					<Bell class="size-5" />
				</a>
				<button
					type="button"
					class="text-text-muted hover:bg-surface-2 hover:text-text rounded-[6px] p-2 transition-colors"
					aria-label="Destek"
					title="Destek"
				>
					<CircleHelp class="size-5" />
				</button>
				<button
					type="button"
					class="border-border bg-surface-2 text-text ml-1 flex size-8 items-center justify-center rounded-full border text-xs font-semibold"
					aria-label="Hesap menüsü"
				>
					PF
				</button>
			</div>
		</header>

		<main class="flex-1 p-4 sm:p-6">
			{@render children()}
		</main>
	</div>
</div>

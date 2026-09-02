<script lang="ts">
	import { goto } from '$app/navigation';
	import { createQuery } from '@tanstack/svelte-query';
	import type { Appointment, Contact, Transaction } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDateTime, formatMoney } from '$lib/format';
	import { focusTrap } from '$lib/actions/focus-trap';
	import { portal } from '$lib/actions/portal';
	import { t } from '$lib/i18n/locale.svelte';
	import Search from '@lucide/svelte/icons/search';
	import User from '@lucide/svelte/icons/user';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Wallet from '@lucide/svelte/icons/wallet';

	type SearchResult = {
		contacts: Contact[];
		appointments: Appointment[];
		transactions: Transaction[];
	};

	let open = $state(false);
	let q = $state('');
	let triggerEl: HTMLButtonElement | undefined = $state();

	const qs = useQueryScope();

	/*
	 * Arama, var olan liste uçlarının `q` filtresini kullanır.
	 *
	 * Eskiden `GET /v1/search` çağrılıyordu; o uç **hiç yazılmamıştı** — yalnız MSW
	 * sahte katmanında bir karşılığı vardı (`lib/mocks/handlers.ts`). Geliştirmede
	 * çalışıyor görünüyor, canlıda 404 dönüyordu; başlıktaki arama bu yüzden hiçbir
	 * zaman sonuç getirmedi (2026-09-02).
	 *
	 * Tek uç yazmak yerine üç liste ucu kullanıldı: üçü de sözleşmede `q` kabul ediyor
	 * (`list-query.ts`), tenant izolasyon testleri zaten var, yeni yüzey açılmıyor.
	 * `contacts` ucu display_name + first_name + last_name üzerinden arıyor.
	 */
	const SEARCH_LIMITS = { contacts: 8, appointments: 6, transactions: 6 } as const;

	const searchQuery = createQuery(() => ({
		queryKey: qs.keys.search.query(q),
		queryFn: async (): Promise<SearchResult> => {
			const term = q.trim();
			const [contacts, appointments, transactions] = await Promise.all([
				apiGet<{ items: Contact[] }>(
					listUrl('contacts', { q: term, limit: SEARCH_LIMITS.contacts })
				).catch(() => ({ items: [] })),
				apiGet<{ items: Appointment[] }>(
					listUrl('appointments', { q: term, limit: SEARCH_LIMITS.appointments })
				).catch(() => ({ items: [] })),
				apiGet<{ items: Transaction[] }>(
					listUrl('transactions', { q: term, limit: SEARCH_LIMITS.transactions })
				).catch(() => ({ items: [] }))
			]);
			return {
				contacts: contacts.items,
				appointments: appointments.items,
				transactions: transactions.items
			};
		},
		enabled: open && q.trim().length >= 2 && qs.ready
	}));

	function openPalette() {
		open = true;
		q = '';
	}

	function closePalette() {
		open = false;
		q = '';
	}

	function onGlobalKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			if (open) closePalette();
			else openPalette();
		}
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			closePalette();
		}
	}

	function navigate(href: string) {
		closePalette();
		void goto(href);
	}

	const hasQuery = $derived(q.trim().length >= 2);
	const empty = $derived(
		hasQuery &&
			!searchQuery.isPending &&
			(searchQuery.data?.contacts.length ?? 0) === 0 &&
			(searchQuery.data?.appointments.length ?? 0) === 0 &&
			(searchQuery.data?.transactions.length ?? 0) === 0
	);
</script>

<svelte:window onkeydown={onGlobalKey} />

<button
	bind:this={triggerEl}
	type="button"
	class="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[6px] border border-border bg-surface px-3 text-left text-sm text-text-faint transition-colors hover:border-text-faint hover:text-text-muted md:max-w-xl"
	aria-label={t('command.aria')}
	onclick={openPalette}
>
	<Search class="size-4 shrink-0" aria-hidden="true" />
	<span class="truncate">{t('command.placeholder')}</span>
	<kbd
		class="ml-auto hidden items-center rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-faint sm:inline-flex"
	>
		⌘K
	</kbd>
</button>

{#if open}
	<div
		use:portal
		class="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[12vh] sm:px-4"
	>
		<div role="presentation" class="absolute inset-0 bg-black/60" onclick={closePalette}></div>
		<div
			use:focusTrap={{ returnFocusTo: triggerEl ?? null }}
			role="dialog"
			aria-modal="true"
			aria-label={t('command.aria')}
			tabindex="-1"
			class="relative z-10 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-[8px] border border-border bg-surface shadow-xl"
		>
			<div class="flex items-center gap-2 border-b border-border px-3">
				<Search class="size-4 shrink-0 text-text-faint" aria-hidden="true" />
				<input
					bind:value={q}
					class="h-12 w-full bg-transparent text-sm text-text outline-none placeholder:text-text-faint"
					placeholder={t('command.placeholder')}
					aria-label={t('command.ariaInput')}
					autocomplete="off"
				/>
				<kbd
					class="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-faint"
				>
					esc
				</kbd>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto p-2">
				{#if !hasQuery}
					<p class="px-2 py-6 text-center text-sm text-text-faint" aria-live="polite">
						{t('command.minChars')}
					</p>
				{:else if searchQuery.isPending}
					<p class="px-2 py-6 text-center text-sm text-text-faint" aria-live="polite">
						{t('command.searching')}
					</p>
				{:else if empty}
					<p class="px-2 py-6 text-center text-sm text-text-faint" aria-live="polite">
						{t('command.empty')}
					</p>
				{:else if searchQuery.data}
					{#if searchQuery.data.contacts.length > 0}
						<p
							class="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-text-faint uppercase"
						>
							{t('nav.contacts')}
						</p>
						<ul class="mb-2">
							{#each searchQuery.data.contacts as c (c.id)}
								<li>
									<button
										type="button"
										class="flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm hover:bg-surface-2"
										onclick={() => navigate(`/contacts/${c.id}`)}
									>
										<User class="size-4 shrink-0 text-text-muted" />
										<span class="min-w-0 flex-1 truncate text-text">{c.display_name}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if searchQuery.data.appointments.length > 0}
						<p
							class="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-text-faint uppercase"
						>
							{t('nav.appointments')}
						</p>
						<ul class="mb-2">
							{#each searchQuery.data.appointments as a (a.id)}
								<li>
									<button
										type="button"
										class="flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm hover:bg-surface-2"
										onclick={() =>
											navigate(a.contact_id ? `/contacts/${a.contact_id}` : '/appointments')}
									>
										<Calendar class="size-4 shrink-0 text-text-muted" />
										<span class="min-w-0 flex-1 truncate text-text">
											{a.contact_display_name}
											<span class="text-text-faint"> · {formatDateTime(a.starts_at)}</span>
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if searchQuery.data.transactions.length > 0}
						<p
							class="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-text-faint uppercase"
						>
							{t('command.group.transactions')}
						</p>
						<ul>
							{#each searchQuery.data.transactions as tx (tx.id)}
								<li>
									<button
										type="button"
										class="flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm hover:bg-surface-2"
										onclick={() =>
											navigate(tx.contact_id ? `/finance?contact=${tx.contact_id}` : '/finance')}
									>
										<Wallet class="size-4 shrink-0 text-text-muted" />
										<span class="min-w-0 flex-1 truncate text-text">{tx.title}</span>
										<span class="shrink-0 text-text-muted tabular-nums">
											{formatMoney(tx.amount, tx.currency)}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

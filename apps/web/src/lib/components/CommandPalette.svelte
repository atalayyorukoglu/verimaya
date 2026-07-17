<script lang="ts">
	import { goto } from '$app/navigation';
	import { createQuery } from '@tanstack/svelte-query';
	import type { Appointment, Patient, Transaction } from '@verimaya/shared';
	import { apiGet } from '$lib/api';
	import { formatDateTime, formatMoney } from '$lib/format';
	import { portal } from '$lib/actions/portal';
	import Search from '@lucide/svelte/icons/search';
	import User from '@lucide/svelte/icons/user';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Wallet from '@lucide/svelte/icons/wallet';

	type SearchResult = {
		patients: Patient[];
		appointments: Appointment[];
		transactions: Transaction[];
	};

	let open = $state(false);
	let q = $state('');
	let inputEl: HTMLInputElement | undefined = $state();

	const searchQuery = createQuery(() => ({
		queryKey: ['search', q],
		queryFn: () => apiGet<SearchResult>(`/v1/search?q=${encodeURIComponent(q)}`),
		enabled: open && q.trim().length >= 2
	}));

	function openPalette() {
		open = true;
		q = '';
		queueMicrotask(() => inputEl?.focus());
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
	const empty =
		$derived(
			hasQuery &&
				!searchQuery.isPending &&
				(searchQuery.data?.patients.length ?? 0) === 0 &&
				(searchQuery.data?.appointments.length ?? 0) === 0 &&
				(searchQuery.data?.transactions.length ?? 0) === 0
		);
</script>

<svelte:window onkeydown={onGlobalKey} />

<button
	type="button"
	class="border-border bg-surface text-text-faint hover:border-text-faint hover:text-text-muted flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[6px] border px-3 text-left text-sm transition-colors md:max-w-xl"
	aria-label="Ara"
	onclick={openPalette}
>
	<Search class="size-4 shrink-0" aria-hidden="true" />
	<span class="truncate">Hasta, randevu veya işlem ara…</span>
	<kbd
		class="border-border bg-surface-2 text-text-faint ml-auto hidden items-center rounded border px-1.5 py-0.5 font-mono text-[11px] sm:inline-flex"
	>
		⌘K
	</kbd>
</button>

{#if open}
	<div
		use:portal
		class="fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[12vh] sm:px-4"
	>
		<button
			type="button"
			class="absolute inset-0 bg-black/60"
			aria-label="Aramayı kapat"
			onclick={closePalette}
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Hızlı arama"
			class="border-border bg-surface relative z-10 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-[8px] border shadow-xl"
		>
			<div class="border-border flex items-center gap-2 border-b px-3">
				<Search class="text-text-faint size-4 shrink-0" />
				<input
					bind:this={inputEl}
					bind:value={q}
					class="text-text placeholder:text-text-faint h-12 w-full bg-transparent text-sm outline-none"
					placeholder="Hasta, randevu veya işlem ara…"
					autocomplete="off"
				/>
				<kbd class="border-border text-text-faint rounded border px-1.5 py-0.5 font-mono text-[10px]">
					esc
				</kbd>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto p-2">
				{#if !hasQuery}
					<p class="text-text-faint px-2 py-6 text-center text-sm">En az 2 karakter yazın</p>
				{:else if searchQuery.isPending}
					<p class="text-text-faint px-2 py-6 text-center text-sm">Aranıyor…</p>
				{:else if empty}
					<p class="text-text-faint px-2 py-6 text-center text-sm">Sonuç yok</p>
				{:else if searchQuery.data}
					{#if searchQuery.data.patients.length > 0}
						<p class="text-text-faint px-2 py-1.5 text-[11px] font-semibold tracking-wider uppercase">
							Hastalar
						</p>
						<ul class="mb-2">
							{#each searchQuery.data.patients as p (p.id)}
								<li>
									<button
										type="button"
										class="hover:bg-surface-2 flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm"
										onclick={() => navigate(`/hastalar/${p.id}`)}
									>
										<User class="text-text-muted size-4 shrink-0" />
										<span class="text-text min-w-0 flex-1 truncate">{p.full_name}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if searchQuery.data.appointments.length > 0}
						<p class="text-text-faint px-2 py-1.5 text-[11px] font-semibold tracking-wider uppercase">
							Randevular
						</p>
						<ul class="mb-2">
							{#each searchQuery.data.appointments as a (a.id)}
								<li>
									<button
										type="button"
										class="hover:bg-surface-2 flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm"
										onclick={() => navigate('/randevular')}
									>
										<Calendar class="text-text-muted size-4 shrink-0" />
										<span class="text-text min-w-0 flex-1 truncate">
											{a.patient_display_name}
											<span class="text-text-faint"> · {formatDateTime(a.starts_at)}</span>
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					{#if searchQuery.data.transactions.length > 0}
						<p class="text-text-faint px-2 py-1.5 text-[11px] font-semibold tracking-wider uppercase">
							İşlemler
						</p>
						<ul>
							{#each searchQuery.data.transactions as t (t.id)}
								<li>
									<button
										type="button"
										class="hover:bg-surface-2 flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm"
										onclick={() => navigate('/finans')}
									>
										<Wallet class="text-text-muted size-4 shrink-0" />
										<span class="text-text min-w-0 flex-1 truncate">{t.title}</span>
										<span class="text-text-muted shrink-0 tabular-nums">
											{formatMoney(t.amount, t.currency)}
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

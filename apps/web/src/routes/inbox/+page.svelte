<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { Conversation, Message } from '@verimaya/shared';
	import { conversationStatusLabels } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { formatDateTime } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type Page<T> = { items: T[]; next_cursor: string | null };

	let selectedId = $state<string | null>(null);

	const conversationsQuery = createQuery(() => ({
		queryKey: ['conversations', { limit: 40 }],
		queryFn: () => apiGet<Page<Conversation>>(listUrl('conversations', { limit: 40 }))
	}));

	const messagesQuery = createQuery(() => ({
		queryKey: ['conversations', selectedId, 'messages'],
		queryFn: () =>
			apiGet<Page<Message>>(listUrl(`conversations/${selectedId}/messages`, { limit: 50 })),
		enabled: !!selectedId
	}));

	const selected = $derived(
		(conversationsQuery.data?.items ?? []).find((c) => c.id === selectedId) ?? null
	);

	$effect(() => {
		const items = conversationsQuery.data?.items;
		if (!selectedId && items && items.length > 0) {
			selectedId = items[0].id;
		}
	});
</script>

<svelte:head>
	<title>WhatsApp Inbox · Verimaya</title>
</svelte:head>

<div class="mx-auto min-w-0 max-w-6xl">
	<PageHeader
		title="WhatsApp Inbox"
		description="Provider-agnostic konuşma listesi — AI onay akışı sonra eklenecek."
	/>

	{#if conversationsQuery.isPending}
		<p class="text-text-muted text-sm">Yükleniyor…</p>
	{:else if conversationsQuery.isError}
		<p class="text-danger text-sm">Konuşmalar yüklenemedi.</p>
	{:else if (conversationsQuery.data?.items.length ?? 0) === 0}
		<div class="border-border bg-surface rounded-lg border p-8 text-center">
			<p class="text-text-muted text-sm">Konuşma yok.</p>
		</div>
	{:else}
		<div
			class="border-border bg-surface grid min-h-[420px] min-w-0 overflow-hidden rounded-lg border lg:grid-cols-[280px_1fr]"
		>
			<aside
				class="border-border divide-border max-h-[40vh] min-w-0 divide-y overflow-y-auto border-b lg:max-h-[70vh] lg:border-r lg:border-b-0"
			>
				{#each conversationsQuery.data?.items ?? [] as conv (conv.id)}
					<button
						type="button"
						class="hover:bg-surface-2 w-full min-w-0 px-3 py-3 text-left transition-colors {selectedId ===
						conv.id
							? 'bg-brand-subtle'
							: ''}"
						onclick={() => (selectedId = conv.id)}
					>
						<div class="flex min-w-0 items-center gap-2">
							<p class="text-text min-w-0 flex-1 truncate text-sm font-medium">
								{conv.contact_name ?? 'Bilinmeyen'}
							</p>
							{#if conv.unread_count > 0}
								<span
									class="bg-brand text-primary-foreground shrink-0 rounded-full px-1.5 text-[10px] font-semibold"
								>
									{conv.unread_count}
								</span>
							{/if}
						</div>
						<p class="text-text-faint mt-0.5 truncate text-xs">{conv.last_message_preview}</p>
					</button>
				{/each}
			</aside>

			<div class="flex min-h-[320px] min-w-0 flex-col overflow-hidden">
				{#if selected}
					<div class="border-border flex min-w-0 items-center justify-between gap-2 border-b px-4 py-3">
						<div class="min-w-0 flex-1 overflow-hidden">
							<p class="text-text truncate text-sm font-semibold">{selected.contact_name}</p>
							<p class="text-text-faint truncate text-xs">{selected.contact_phone}</p>
						</div>
						<StatusBadge label={conversationStatusLabels[selected.status]} tone="info" />
					</div>
					<div class="min-w-0 flex-1 space-y-3 overflow-y-auto p-4">
						{#if messagesQuery.isPending}
							<p class="text-text-faint text-sm">Mesajlar yükleniyor…</p>
						{:else}
							{#each messagesQuery.data?.items ?? [] as msg (msg.id)}
								<div
									class="flex {msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}"
								>
									<div
										class="max-w-[min(80%,24rem)] break-words rounded-[8px] px-3 py-2 text-sm {msg.direction ===
										'outbound'
											? 'bg-brand-subtle text-text'
											: 'bg-surface-2 text-text'}"
									>
										<p>{msg.body}</p>
										<p class="text-text-faint mt-1 text-[10px]">{formatDateTime(msg.sent_at)}</p>
									</div>
								</div>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

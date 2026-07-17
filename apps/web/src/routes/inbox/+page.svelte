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

<div class="mx-auto max-w-6xl min-w-0">
	<PageHeader
		title="WhatsApp Inbox"
		description="Provider-agnostic konuşma listesi — AI onay akışı sonra eklenecek."
	/>

	{#if conversationsQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if conversationsQuery.isError}
		<p class="text-sm text-danger">Konuşmalar yüklenemedi.</p>
	{:else if (conversationsQuery.data?.items.length ?? 0) === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">Konuşma yok.</p>
		</div>
	{:else}
		<div
			class="grid min-h-[420px] min-w-0 overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-[280px_1fr]"
		>
			<aside
				class="max-h-[40vh] min-w-0 divide-y divide-border overflow-y-auto border-b border-border lg:max-h-[70vh] lg:border-r lg:border-b-0"
			>
				{#each conversationsQuery.data?.items ?? [] as conv (conv.id)}
					<button
						type="button"
						class="w-full min-w-0 px-3 py-3 text-left transition-colors hover:bg-surface-2 {selectedId ===
						conv.id
							? 'bg-brand-subtle'
							: ''}"
						onclick={() => (selectedId = conv.id)}
					>
						<div class="flex min-w-0 items-center gap-2">
							<p class="min-w-0 flex-1 truncate text-sm font-medium text-text">
								{conv.contact_name ?? 'Bilinmeyen'}
							</p>
							{#if conv.unread_count > 0}
								<span
									class="shrink-0 rounded-full bg-brand px-1.5 text-[10px] font-semibold text-primary-foreground"
								>
									{conv.unread_count}
								</span>
							{/if}
						</div>
						<p class="mt-0.5 truncate text-xs text-text-faint">{conv.last_message_preview}</p>
					</button>
				{/each}
			</aside>

			<div class="flex min-h-[320px] min-w-0 flex-col overflow-hidden">
				{#if selected}
					<div
						class="flex min-w-0 items-center justify-between gap-2 border-b border-border px-4 py-3"
					>
						<div class="min-w-0 flex-1 overflow-hidden">
							<p class="truncate text-sm font-semibold text-text">{selected.contact_name}</p>
							<p class="truncate text-xs text-text-faint">{selected.contact_phone}</p>
						</div>
						<StatusBadge label={conversationStatusLabels[selected.status]} tone="info" />
					</div>
					<div class="min-w-0 flex-1 space-y-3 overflow-y-auto p-4">
						{#if messagesQuery.isPending}
							<p class="text-sm text-text-faint">Mesajlar yükleniyor…</p>
						{:else}
							{#each messagesQuery.data?.items ?? [] as msg (msg.id)}
								<div class="flex {msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}">
									<div
										class="max-w-[min(80%,24rem)] rounded-[8px] px-3 py-2 text-sm break-words {msg.direction ===
										'outbound'
											? 'bg-brand-subtle text-text'
											: 'bg-surface-2 text-text'}"
									>
										<p>{msg.body}</p>
										<p class="mt-1 text-[10px] text-text-faint">{formatDateTime(msg.sent_at)}</p>
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

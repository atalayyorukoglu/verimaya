<script lang="ts">
	import { createInfiniteQuery } from '@tanstack/svelte-query';
	import type { AuditLog } from '@verimaya/shared';
	import { auditActionLabels, auditEntityLabels } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { formatDateTime } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';

	type Page = { items: AuditLog[]; next_cursor: string | null };

	const logsQuery = createInfiniteQuery(() => ({
		queryKey: ['audit-logs'],
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<Page>(listUrl('audit-logs', { limit: 25, cursor: pageParam })),
		initialPageParam: null as string | null,
		getNextPageParam: (last: Page) => last.next_cursor
	}));

	const items = $derived(logsQuery.data?.pages.flatMap((p) => p.items) ?? []);

	function actionTone(action: AuditLog['action']): 'success' | 'info' | 'danger' | 'neutral' {
		switch (action) {
			case 'create':
				return 'success';
			case 'update':
				return 'info';
			case 'delete':
				return 'danger';
			default:
				return 'neutral';
		}
	}
</script>

<svelte:head>
	<title>Denetim Kaydı · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title="Denetim Kaydı"
		description="Tenant içindeki oluşturma, güncelleme ve silme olayları."
	/>

	{#if logsQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if logsQuery.isError}
		<p class="text-sm text-danger">Denetim kaydı yüklenemedi.</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">Henüz kayıt yok.</p>
		</div>
	{:else}
		<ul
			class="min-w-0 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
		>
			{#each items as log (log.id)}
				<li class="flex min-w-0 items-start gap-3 px-4 py-3">
					<StatusBadge label={auditActionLabels[log.action]} tone={actionTone(log.action)} />
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm text-text">
							<span class="font-medium">{log.actor_display_name}</span>
							<span class="text-text-muted">· {auditEntityLabels[log.entity_type]}</span>
							{#if log.entity_label}
								<span class="text-text-muted">— {log.entity_label}</span>
							{/if}
						</p>
					</div>
					<time
						class="shrink-0 text-xs whitespace-nowrap text-text-faint"
						datetime={log.created_at}
					>
						{formatDateTime(log.created_at)}
					</time>
				</li>
			{/each}
		</ul>

		{#if logsQuery.hasNextPage}
			<div class="mt-4 flex justify-center">
				<Button
					variant="outline"
					type="button"
					disabled={logsQuery.isFetchingNextPage}
					onclick={() => logsQuery.fetchNextPage()}
				>
					{logsQuery.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla yükle'}
				</Button>
			</div>
		{/if}

		<p class="mt-4 text-xs text-text-faint">
			Demo veri. Gerçek denetim kaydı, API tarafında her mutasyonda otomatik yazılacak (Faz 0b+).
		</p>
	{/if}
</div>

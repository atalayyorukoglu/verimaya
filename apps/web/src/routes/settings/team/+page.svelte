<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { MembershipUser, UserRole } from '@verimaya/shared';
	import { userRoleLabels } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { formatDate } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';

	type Page = { items: MembershipUser[]; next_cursor: string | null };

	const membersQuery = createQuery(() => ({
		queryKey: ['members'],
		queryFn: () => apiGet<Page>(listUrl('members', { limit: 50 }))
	}));

	const members = $derived(membersQuery.data?.items ?? []);

	function roleTone(role: UserRole): 'brand' | 'info' | 'warning' | 'success' | 'neutral' {
		switch (role) {
			case 'owner':
				return 'brand';
			case 'admin':
				return 'info';
			case 'manager':
				return 'warning';
			case 'finance':
				return 'success';
			default:
				return 'neutral';
		}
	}

	function initials(name: string): string {
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase() ?? '')
			.join('');
	}
</script>

<svelte:head>
	<title>Ekip · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<SettingsBackLink />
	<PageHeader title="Ekip" description="Tenant üyeleri ve rolleri.">
		{#snippet actions()}
			<Button type="button" disabled title="Davet akışı Faz 0b'de (better-auth organization)">
				Üye davet et
			</Button>
		{/snippet}
	</PageHeader>

	{#if membersQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if membersQuery.isError}
		<p class="text-sm text-danger">Ekip listesi yüklenemedi.</p>
	{:else if members.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">Üye yok.</p>
		</div>
	{:else}
		<ul
			class="min-w-0 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
		>
			{#each members as member (member.id)}
				<li class="flex min-w-0 items-center gap-3 px-4 py-3">
					<span
						class="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-xs font-semibold text-brand"
					>
						{initials(member.display_name)}
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-text">{member.display_name}</p>
						<p class="truncate text-xs text-text-faint">{member.email}</p>
					</div>
					<div class="hidden shrink-0 text-right sm:block">
						<p class="text-xs text-text-faint">Katılım</p>
						<p class="text-xs text-text-muted">{formatDate(member.created_at)}</p>
					</div>
					<StatusBadge label={userRoleLabels[member.role]} tone={roleTone(member.role)} />
				</li>
			{/each}
		</ul>

		<p class="mt-4 text-xs text-text-faint">
			Davet, rol değiştirme ve üye çıkarma better-auth organization ile Faz 0b'de gelecek. Rol
			görünürlüğünü denemek için sağ alttaki demo rol değiştiriciyi kullan.
		</p>
	{/if}
</div>

<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { MembershipUser, UserRole } from '@verimaya/shared';
	import { apiPaths, listUrl, userRoleLabels, userRoleSchema } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { meQueryOptions } from '$lib/me-query';
	import { formatDate } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';

	type Page = { items: MembershipUser[]; next_cursor: string | null };

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const meQuery = createQuery(() => ({
		...meQueryOptions(),
		enabled: qs.ready
	}));

	const membersQuery = createQuery(() => ({
		queryKey: qs.keys.members.list({ limit: 50 }),
		queryFn: () => apiGet<Page>(listUrl('members', { limit: 50 })),
		enabled: qs.ready
	}));

	const members = $derived(membersQuery.data?.items ?? []);
	const me = $derived(meQuery.data);
	const canManageRoles = $derived(me?.role === 'owner' || me?.role === 'admin');

	let savingId = $state<string | null>(null);
	let roleError = $state<string | null>(null);

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

	function isSelf(member: MembershipUser): boolean {
		return me?.email != null && member.email === me.email;
	}

	async function changeRole(member: MembershipUser, role: UserRole) {
		if (role === member.role) return;
		savingId = member.id;
		roleError = null;
		try {
			await apiSend(apiPaths.member(member.id), 'PATCH', { role });
			await queryClient.invalidateQueries({ queryKey: qs.keys.members.all() });
		} catch (err) {
			roleError = err instanceof Error ? err.message : t('settings.team.roleSaveError');
		} finally {
			savingId = null;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.team.title')} · Ayarlar · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<SettingsBackLink />
	<PageHeader title={t('settings.team.title')} description={t('settings.team.description')}>
		{#snippet actions()}
			<Button type="button" disabled title={t('settings.team.inviteDisabled')}>
				{t('settings.team.invite')}
			</Button>
		{/snippet}
	</PageHeader>

	{#if membersQuery.isPending}
		<p class="text-sm text-text-muted">{t('settings.team.loading')}</p>
	{:else if membersQuery.isError}
		<p class="text-sm text-danger">{t('settings.team.loadError')}</p>
	{:else if members.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">{t('settings.team.empty')}</p>
		</div>
	{:else}
		{#if roleError}
			<p class="mb-3 text-sm text-danger">{roleError}</p>
		{/if}
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
						<p class="text-xs text-text-faint">{t('settings.team.joined')}</p>
						<p class="text-xs text-text-muted">{formatDate(member.created_at)}</p>
					</div>
					{#if canManageRoles && !isSelf(member)}
						<select
							class="h-9 max-w-[9rem] shrink-0 rounded-md border border-border bg-surface px-2 text-sm text-text"
							value={member.role}
							disabled={savingId === member.id}
							aria-label={t('settings.team.roleLabel')}
							onchange={(e) => {
								const parsed = userRoleSchema.safeParse(e.currentTarget.value);
								if (parsed.success) void changeRole(member, parsed.data);
							}}
						>
							{#each userRoleSchema.options as role (role)}
								<option value={role}>{userRoleLabels[role]}</option>
							{/each}
						</select>
					{:else}
						<StatusBadge label={userRoleLabels[member.role]} tone={roleTone(member.role)} />
					{/if}
				</li>
			{/each}
		</ul>

		<p class="mt-4 text-xs text-text-faint">{t('settings.team.footnote')}</p>
	{/if}
</div>

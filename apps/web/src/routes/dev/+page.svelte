<script lang="ts">
	import { goto } from '$app/navigation';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { MembershipUser, PlatformTenant, UserRole } from '@verimaya/shared';
	import { apiPaths, userRoleLabels } from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass } from '$lib/api';
	import { canAccessPlatformPanel, resolveDevPanelRoute } from '$lib/dev-panel';
	import { DEV_PANEL_ENABLED } from '$lib/dev-panel-enabled';
	import { t } from '$lib/i18n/locale.svelte';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';

	const queryClient = useQueryClient();
	const qs = useQueryScope();
	const roles = Object.keys(userRoleLabels) as UserRole[];

	const platformEnabled = $derived(
		canAccessPlatformPanel(qs.meQuery.data?.platform_admin === true, DEV_PANEL_ENABLED)
	);
	const routeGate = $derived(resolveDevPanelRoute(platformEnabled));
	const selfEmail = $derived(qs.meQuery.data?.email ?? '');

	$effect(() => {
		if (qs.meQuery.isPending) return;
		if (routeGate.action === 'redirect') {
			void goto(routeGate.to, { replaceState: true });
		}
	});

	const tenantsQuery = createQuery(() => ({
		queryKey: ['platform', 'tenants'],
		queryFn: () => apiGet<{ items: PlatformTenant[] }>(apiPaths.platformTenants),
		enabled: platformEnabled
	}));

	const tenants = $derived(tenantsQuery.data?.items ?? []);

	let targetTenantId = $state('');
	let hydratedTarget = $state(false);

	$effect(() => {
		if (!platformEnabled || hydratedTarget || tenants.length === 0) return;
		targetTenantId = tenants[0]?.id ?? '';
		hydratedTarget = true;
	});

	const usersQuery = createQuery(() => ({
		queryKey: ['platform', 'tenants', targetTenantId, 'members'],
		queryFn: () =>
			apiGet<{ items: MembershipUser[] }>(apiPaths.platformTenantMembers(targetTenantId)),
		enabled: platformEnabled && !!targetTenantId
	}));

	const users = $derived(usersQuery.data?.items ?? []);

	let newOrgName = $state('');
	let grantSelf = $state(true);
	let savingOrg = $state(false);

	let email = $state('');
	let password = $state('');
	let displayName = $state('');
	let role = $state<UserRole>('agent');
	let savingUser = $state(false);

	let error = $state<string | null>(null);

	async function refreshTenants() {
		await queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
	}

	async function refreshUsers() {
		await queryClient.invalidateQueries({
			queryKey: ['platform', 'tenants', targetTenantId, 'members']
		});
	}

	async function createOrg(e: Event) {
		e.preventDefault();
		const name = newOrgName.trim();
		if (!name) return;
		savingOrg = true;
		error = null;
		try {
			const created = await apiSend<PlatformTenant>(apiPaths.platformTenants, 'POST', {
				name,
				grant_self_admin: grantSelf
			});
			newOrgName = '';
			await refreshTenants();
			targetTenantId = created.id;
		} catch (err) {
			error = err instanceof Error ? err.message : t('dev.error.createOrg');
		} finally {
			savingOrg = false;
		}
	}

	async function renameOrg(row: PlatformTenant) {
		const name = window.prompt(t('dev.renamePrompt'), row.name);
		if (name == null || !name.trim() || name.trim() === row.name) return;
		error = null;
		try {
			await apiSend(apiPaths.platformTenant(row.id), 'PATCH', { name: name.trim() });
			await refreshTenants();
		} catch (err) {
			error = err instanceof Error ? err.message : t('dev.error.rename');
		}
	}

	async function deleteOrg(row: PlatformTenant) {
		if (!window.confirm(t('dev.deleteConfirm', { name: row.name }))) return;
		error = null;
		try {
			await apiSend(apiPaths.platformTenant(row.id), 'DELETE');
			if (targetTenantId === row.id) {
				hydratedTarget = false;
				targetTenantId = '';
			}
			await refreshTenants();
		} catch (err) {
			error = err instanceof Error ? err.message : t('dev.error.delete');
		}
	}

	async function saveUser(e: Event) {
		e.preventDefault();
		if (!targetTenantId) return;
		savingUser = true;
		error = null;
		try {
			await apiSend(apiPaths.platformTenantMembers(targetTenantId), 'POST', {
				email: email.trim().toLowerCase(),
				password,
				display_name: displayName.trim(),
				role
			});
			email = '';
			password = '';
			displayName = '';
			role = 'agent';
			await refreshUsers();
			await queryClient.invalidateQueries({ queryKey: qs.keys.members.all() });
		} catch (err) {
			error = err instanceof Error ? err.message : t('dev.error.saveUser');
		} finally {
			savingUser = false;
		}
	}

	async function removeUser(u: MembershipUser) {
		if (selfEmail && u.email === selfEmail) {
			error = t('dev.cannotRemoveSelf');
			return;
		}
		if (!window.confirm(t('dev.removeConfirm', { email: u.email }))) return;
		error = null;
		try {
			await apiSend(apiPaths.platformTenantMember(targetTenantId, u.id), 'DELETE');
			await refreshUsers();
			await queryClient.invalidateQueries({ queryKey: qs.keys.members.all() });
		} catch (err) {
			error = err instanceof Error ? err.message : t('dev.error.remove');
		}
	}
</script>

<svelte:head>
	{#if platformEnabled}
		<title>{t('dev.documentTitle')}</title>
	{/if}
</svelte:head>

{#if !platformEnabled || routeGate.action === 'redirect'}
	<p class="p-6 text-sm text-text-muted">{t('dev.redirecting')}</p>
{:else}
	<div class="mx-auto max-w-3xl min-w-0 space-y-8">
		<PageHeader title={t('dev.title')} description={t('dev.description')} />

		{#if error}
			<p
				class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
				role="alert"
			>
				{error}
			</p>
		{/if}

		<section>
			<h2 class="text-xs font-semibold tracking-wider text-text-muted uppercase">
				{t('dev.orgs')}
			</h2>
			<form
				class="mt-3 flex max-w-xl flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
				onsubmit={createOrg}
			>
				<label class="min-w-[12rem] flex-1 text-xs font-medium text-text-muted">
					{t('dev.newOrgName')}
					<input class="{fieldClass} mt-1" bind:value={newOrgName} required />
				</label>
				<label class="flex items-center gap-2 text-xs text-text-muted">
					<input type="checkbox" class="cursor-pointer" bind:checked={grantSelf} />
					{t('dev.grantSelf')}
				</label>
				<Button type="submit" disabled={savingOrg}>
					{savingOrg ? '…' : t('dev.createOrg')}
				</Button>
			</form>

			<div class="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
				{#if tenantsQuery.isPending}
					<p class="p-4 text-sm text-text-muted">{t('dev.loading')}</p>
				{:else}
					<table class="w-full min-w-[36rem] text-left text-sm">
						<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
							<tr>
								<th class="px-3 py-2 font-medium">{t('dev.newOrgName')}</th>
								<th class="px-3 py-2 font-mono font-medium">id</th>
								<th class="px-3 py-2 font-medium"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each tenants as row (row.id)}
								<tr class={row.deleted_at ? 'opacity-60' : ''}>
									<td class="px-3 py-2 font-medium text-text">
										{row.name}
										{#if row.deleted_at}
											<span class="ml-2 text-[10px] font-normal tracking-wide text-danger uppercase"
												>{t('dev.deletedBadge')}</span
											>
										{/if}
									</td>
									<td class="px-3 py-2 font-mono text-[11px] text-text-faint">{row.id}</td>
									<td class="space-x-3 px-3 py-2 text-right">
										<button
											type="button"
											class="cursor-pointer text-xs font-medium text-brand hover:underline"
											onclick={() => renameOrg(row)}
										>
											{t('dev.rename')}
										</button>
										{#if !row.deleted_at}
											<button
												type="button"
												class="cursor-pointer text-xs font-medium text-danger hover:underline"
												onclick={() => deleteOrg(row)}
											>
												{t('dev.delete')}
											</button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</section>

		<section>
			<h2 class="text-xs font-semibold tracking-wider text-text-muted uppercase">
				{t('dev.usersSection')}
			</h2>
			<p class="mt-1 text-xs text-text-muted">{t('dev.usersHint')}</p>
			<label class="mt-3 block max-w-md text-xs font-medium text-text-muted">
				{t('dev.targetOrg')}
				<select class="{fieldClass} mt-1" bind:value={targetTenantId}>
					{#each tenants as row (row.id)}
						<option value={row.id}
							>{row.name}{row.deleted_at ? ` (${t('dev.deletedBadge')})` : ''}</option
						>
					{/each}
				</select>
			</label>

			<form
				class="mt-6 max-w-xl space-y-3 rounded-lg border border-border bg-surface p-4"
				onsubmit={saveUser}
			>
				<h3 class="text-sm font-medium text-text">{t('dev.addUser')}</h3>
				<div class="grid gap-2 sm:grid-cols-2">
					<label class="text-xs font-medium text-text-muted">
						{t('dev.email')}
						<input class="{fieldClass} mt-1" type="email" bind:value={email} required />
					</label>
					<label class="text-xs font-medium text-text-muted">
						{t('dev.password')}
						<input
							class="{fieldClass} mt-1"
							type="password"
							bind:value={password}
							minlength="8"
							required
						/>
					</label>
				</div>
				<label class="block text-xs font-medium text-text-muted">
					{t('dev.displayName')}
					<input class="{fieldClass} mt-1" bind:value={displayName} required />
				</label>
				<label class="block text-xs font-medium text-text-muted">
					{t('dev.role')}
					<select class="{fieldClass} mt-1" bind:value={role}>
						{#each roles as r (r)}
							<option value={r}>{userRoleLabels[r]}</option>
						{/each}
					</select>
				</label>
				<Button type="submit" disabled={savingUser || !targetTenantId}>
					{savingUser ? t('dev.saving') : t('dev.saveUser')}
				</Button>
			</form>

			<div class="mt-6">
				<h3 class="text-sm font-medium text-text">{t('dev.usersSection')}</h3>
				{#if !targetTenantId}
					<p class="mt-2 text-sm text-text-muted">{t('dev.pickOrg')}</p>
				{:else if usersQuery.isPending}
					<p class="mt-2 text-sm text-text-muted">{t('dev.loading')}</p>
				{:else}
					<div class="mt-2 overflow-x-auto rounded-lg border border-border bg-surface">
						<table class="w-full min-w-[32rem] text-left text-sm">
							<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
								<tr>
									<th class="px-3 py-2 font-medium">{t('dev.email')}</th>
									<th class="px-3 py-2 font-medium">{t('dev.displayName')}</th>
									<th class="px-3 py-2 font-medium">{t('dev.role')}</th>
									<th class="px-3 py-2 font-medium"></th>
								</tr>
							</thead>
							<tbody class="divide-y divide-border">
								{#each users as u (u.id)}
									<tr>
										<td class="px-3 py-2 font-mono text-xs text-text">{u.email}</td>
										<td class="px-3 py-2 text-text">{u.display_name}</td>
										<td class="px-3 py-2 text-text-muted">{userRoleLabels[u.role]}</td>
										<td class="px-3 py-2 text-right">
											{#if selfEmail && u.email === selfEmail}
												<span class="text-xs text-text-faint">{t('dev.you')}</span>
											{:else}
												<button
													type="button"
													class="cursor-pointer text-xs font-medium text-danger hover:underline"
													onclick={() => removeUser(u)}
												>
													{t('dev.remove')}
												</button>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
						{#if users.length === 0}
							<p class="p-3 text-sm text-text-muted">{t('dev.emptyUsers')}</p>
						{/if}
					</div>
				{/if}
			</div>
		</section>
	</div>
{/if}

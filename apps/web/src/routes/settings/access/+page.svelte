<script lang="ts">
	import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		apiPaths,
		type OrgPermissionAction,
		type OrgPermissionResource,
		type PermissionMatrix,
		type PermissionOverrideChange,
		type UserRole,
		userRoleLabels,
		WRITE_ORG_PERMISSION_ACTIONS
	} from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { meQueryOptions } from '$lib/me-query';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const meQuery = createQuery(() => ({
		...meQueryOptions(),
		enabled: qs.ready
	}));

	const matrixQuery = createQuery(() => ({
		queryKey: qs.keys.settings.permissions(),
		queryFn: () => apiGet<PermissionMatrix>(apiPaths.settingsPermissions),
		enabled: qs.ready
	}));

	const canEdit = $derived(meQuery.data?.role === 'owner' || meQuery.data?.role === 'admin');
	const matrix = $derived(matrixQuery.data);
	let error = $state<string | null>(null);
	let pendingKey = $state<string | null>(null);

	const patchMutation = createMutation(() => ({
		mutationFn: (changes: PermissionOverrideChange[]) =>
			apiSend<PermissionMatrix>(apiPaths.settingsPermissions, 'PATCH', { changes }),
		onSuccess: (data) => {
			queryClient.setQueryData(qs.keys.settings.permissions(), data);
			error = null;
		},
		onError: (err) => {
			error = err instanceof Error ? err.message : t('settings.access.saveError');
		},
		onSettled: () => {
			pendingKey = null;
		}
	}));

	const resourceLabelKey = {
		contact: 'settings.access.resource.contact',
		finance: 'settings.access.resource.finance',
		settings: 'settings.access.resource.settings',
		audit: 'settings.access.resource.audit',
		members: 'settings.access.resource.members',
		api_keys: 'settings.access.resource.api_keys',
		webhook_subscriptions: 'settings.access.resource.webhook_subscriptions',
		scorecard: 'settings.access.resource.scorecard'
	} as const satisfies Record<OrgPermissionResource, MessageKey>;

	function actionsOf(
		m: PermissionMatrix,
		layer: 'defaults' | 'effective',
		role: UserRole,
		resource: OrgPermissionResource
	): OrgPermissionAction[] {
		return m[layer][role]?.[resource] ?? [];
	}

	function hasView(
		m: PermissionMatrix,
		layer: 'defaults' | 'effective',
		role: UserRole,
		resource: OrgPermissionResource
	) {
		return actionsOf(m, layer, role, resource).includes('read');
	}

	function writeActions(
		m: PermissionMatrix,
		layer: 'defaults' | 'effective',
		role: UserRole,
		resource: OrgPermissionResource
	): OrgPermissionAction[] {
		return actionsOf(m, layer, role, resource).filter((a) =>
			(WRITE_ORG_PERMISSION_ACTIONS as readonly string[]).includes(a)
		);
	}

	function hasEdit(
		m: PermissionMatrix,
		layer: 'defaults' | 'effective',
		role: UserRole,
		resource: OrgPermissionResource
	) {
		return writeActions(m, layer, role, resource).length > 0;
	}

	function isOverridden(
		m: PermissionMatrix,
		role: UserRole,
		resource: OrgPermissionResource
	): boolean {
		const d = new Set(actionsOf(m, 'defaults', role, resource));
		const e = new Set(actionsOf(m, 'effective', role, resource));
		if (d.size !== e.size) return true;
		for (const a of d) if (!e.has(a)) return true;
		return false;
	}

	function isLocked(
		m: PermissionMatrix,
		role: UserRole,
		resource: OrgPermissionResource,
		action: OrgPermissionAction
	) {
		return m.locked.some((c) => c.role === role && c.resource === resource && c.action === action);
	}

	function viewLocked(m: PermissionMatrix, role: UserRole, resource: OrgPermissionResource) {
		return isLocked(m, role, resource, 'read');
	}

	function editLocked(m: PermissionMatrix, role: UserRole, resource: OrgPermissionResource) {
		return WRITE_ORG_PERMISSION_ACTIONS.some((a) => isLocked(m, role, resource, a));
	}

	async function apply(changes: PermissionOverrideChange[], key: string) {
		if (!canEdit || changes.length === 0) return;
		pendingKey = key;
		error = null;
		await patchMutation.mutateAsync(changes);
	}

	async function toggleView(role: UserRole, resource: OrgPermissionResource) {
		if (!matrix || !canEdit) return;
		if (!hasView(matrix, 'defaults', role, resource)) return;
		if (viewLocked(matrix, role, resource)) return;
		const currently = hasView(matrix, 'effective', role, resource);
		await apply(
			[{ role, resource, action: 'read', allowed: currently ? false : null }],
			`${role}:${resource}:view`
		);
	}

	async function toggleEdit(role: UserRole, resource: OrgPermissionResource) {
		if (!matrix || !canEdit) return;
		const defaults = writeActions(matrix, 'defaults', role, resource);
		if (defaults.length === 0) return;
		if (editLocked(matrix, role, resource)) return;
		const currently = hasEdit(matrix, 'effective', role, resource);
		await apply(
			defaults.map((action) => ({
				role,
				resource,
				action,
				allowed: currently ? false : null
			})),
			`${role}:${resource}:edit`
		);
	}

	async function resetCell(role: UserRole, resource: OrgPermissionResource) {
		if (!matrix || !canEdit) return;
		const changes: PermissionOverrideChange[] = actionsOf(matrix, 'defaults', role, resource)
			.filter((action) => !isLocked(matrix, role, resource, action))
			.map((action) => ({ role, resource, action, allowed: null }));
		await apply(changes, `${role}:${resource}:reset`);
	}
</script>

<svelte:head>
	<title>{t('settings.access.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<SettingsBackLink />
	<PageHeader title={t('settings.access.title')} description={t('settings.access.description')} />

	{#if !canEdit}
		<p class="mb-3 text-sm text-text-muted">{t('settings.access.readOnly')}</p>
	{/if}

	{#if matrixQuery.isPending}
		<p class="text-sm text-text-muted">{t('settings.access.loading')}</p>
	{:else if matrixQuery.isError || !matrix}
		<p class="text-sm text-danger">{t('settings.access.loadError')}</p>
	{:else}
		{#if error}
			<p class="mb-3 text-sm text-danger" role="alert">{error}</p>
		{/if}

		<div class="overflow-x-auto rounded-lg border border-border bg-surface">
			<table class="w-max min-w-full text-left text-sm">
				<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
					<tr>
						<th class="sticky left-0 z-10 bg-surface-2/95 px-3 py-2.5 font-medium backdrop-blur-sm">
							{t('settings.access.col.resource')}
						</th>
						{#each matrix.roles as role (role)}
							<th class="px-2 py-2.5 text-center font-medium" colspan="3">
								{userRoleLabels[role]}
							</th>
						{/each}
					</tr>
					<tr>
						<th class="sticky left-0 z-10 bg-surface-2/95 px-3 py-1.5 backdrop-blur-sm"></th>
						{#each matrix.roles as role (role)}
							<th class="px-1 py-1.5 text-center font-normal">{t('settings.access.col.view')}</th>
							<th class="px-1 py-1.5 text-center font-normal">{t('settings.access.col.edit')}</th>
							<th class="sr-only px-1 py-1.5 text-center font-normal"
								>{t('settings.access.resetCell')}</th
							>
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each matrix.resources as resource (resource)}
						<tr class="align-middle">
							<td
								class="sticky left-0 z-10 bg-surface px-3 py-2 font-medium text-text backdrop-blur-sm"
							>
								{t(resourceLabelKey[resource])}
							</td>
							{#each matrix.roles as role (role)}
								{@const defView = hasView(matrix, 'defaults', role, resource)}
								{@const effView = hasView(matrix, 'effective', role, resource)}
								{@const defEdit = hasEdit(matrix, 'defaults', role, resource)}
								{@const effEdit = hasEdit(matrix, 'effective', role, resource)}
								{@const overridden = isOverridden(matrix, role, resource)}
								{@const vLock = viewLocked(matrix, role, resource)}
								{@const eLock = editLocked(matrix, role, resource)}
								{@const busy = pendingKey?.startsWith(`${role}:${resource}:`) === true}
								<td
									class="px-1 py-1 text-center {overridden && defView !== effView
										? 'bg-warning/10'
										: ''}"
									title={vLock
										? t('settings.access.locked')
										: overridden && defView !== effView
											? t('settings.access.overridden')
											: undefined}
								>
									<button
										type="button"
										class="inline-flex h-11 min-w-11 items-center justify-center rounded-md text-base disabled:cursor-not-allowed disabled:opacity-40"
										disabled={!canEdit || !defView || vLock || busy}
										aria-pressed={effView}
										aria-label="{userRoleLabels[role]} {t(resourceLabelKey[resource])} {t(
											'settings.access.col.view'
										)}"
										onclick={() => toggleView(role, resource)}
									>
										<span class={effView ? 'text-success' : 'text-text-faint'}>
											{effView ? '●' : '·'}
										</span>
									</button>
								</td>
								<td
									class="px-1 py-1 text-center {overridden && defEdit !== effEdit
										? 'bg-warning/10'
										: ''}"
									title={eLock
										? t('settings.access.locked')
										: overridden && defEdit !== effEdit
											? t('settings.access.overridden')
											: undefined}
								>
									<button
										type="button"
										class="inline-flex h-11 min-w-11 items-center justify-center rounded-md text-base disabled:cursor-not-allowed disabled:opacity-40"
										disabled={!canEdit || !defEdit || eLock || busy}
										aria-pressed={effEdit}
										aria-label="{userRoleLabels[role]} {t(resourceLabelKey[resource])} {t(
											'settings.access.col.edit'
										)}"
										onclick={() => toggleEdit(role, resource)}
									>
										<span class={effEdit ? 'text-success' : 'text-text-faint'}>
											{effEdit ? '●' : '·'}
										</span>
									</button>
								</td>
								<td class="px-1 py-1 text-center">
									{#if overridden && canEdit}
										<Button
											variant="ghost"
											size="sm"
											class="h-11 min-h-11 px-2 text-xs"
											disabled={busy}
											onclick={() => resetCell(role, resource)}
										>
											{t('settings.access.resetCell')}
										</Button>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<p class="mt-3 text-xs text-text-faint">
			{t('settings.access.footnote')}
		</p>
	{/if}
</div>

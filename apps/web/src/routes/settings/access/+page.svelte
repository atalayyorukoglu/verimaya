<script lang="ts">
	import { userRoleLabels, type UserRole } from '@verimaya/shared';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';

	const roles = Object.keys(userRoleLabels) as UserRole[];

	const permissions = $derived([
		{
			key: 'patients',
			label: t('nav.patients'),
			allow: ['owner', 'admin', 'manager', 'agent', 'readonly'] as UserRole[]
		},
		{
			key: 'appointments',
			label: t('nav.appointments'),
			allow: ['owner', 'admin', 'manager', 'agent', 'readonly'] as UserRole[]
		},
		{
			key: 'finance',
			label: t('settings.access.perm.finance'),
			allow: ['owner', 'admin', 'manager', 'finance'] as UserRole[]
		},
		{
			key: 'reports',
			label: t('nav.reports'),
			allow: ['owner', 'admin', 'manager', 'finance', 'readonly'] as UserRole[]
		},
		{
			key: 'integrations',
			label: t('settings.access.perm.integrations'),
			allow: ['owner', 'admin'] as UserRole[]
		},
		{
			key: 'team',
			label: t('settings.access.perm.team'),
			allow: ['owner', 'admin'] as UserRole[]
		},
		{
			key: 'settings',
			label: t('nav.settings'),
			allow: ['owner', 'admin'] as UserRole[]
		},
		{
			key: 'audit',
			label: t('settings.access.perm.audit'),
			allow: ['owner', 'admin'] as UserRole[]
		}
	]);

	function cell(allow: UserRole[], role: UserRole): boolean {
		return allow.includes(role);
	}
</script>

<svelte:head>
	<title>{t('settings.access.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<SettingsBackLink />
	<PageHeader title={t('settings.access.title')} description={t('settings.access.description')} />

	<div class="overflow-x-auto rounded-lg border border-border bg-surface">
		<table class="w-full min-w-[640px] text-left text-sm">
			<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
				<tr>
					<th class="px-3 py-2.5 font-medium">{t('settings.access.col.permission')}</th>
					{#each roles as role (role)}
						<th class="px-2 py-2.5 text-center font-medium">{userRoleLabels[role]}</th>
					{/each}
				</tr>
			</thead>
			<tbody class="divide-y divide-border">
				{#each permissions as perm (perm.key)}
					<tr>
						<td class="px-3 py-2.5 font-medium text-text">{perm.label}</td>
						{#each roles as role (role)}
							<td class="px-2 py-2.5 text-center">
								{#if cell(perm.allow, role)}
									<span class="text-success">●</span>
								{:else}
									<span class="text-text-faint">·</span>
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
</div>

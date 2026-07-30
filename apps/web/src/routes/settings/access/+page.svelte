<script lang="ts">
	import { userRoleLabels, type UserRole } from '@verimaya/shared';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';

	const roles = Object.keys(userRoleLabels) as UserRole[];

	const permissions: { key: string; label: string; allow: UserRole[] }[] = [
		{
			key: 'patients',
			label: 'Hastalar',
			allow: ['owner', 'admin', 'manager', 'agent', 'readonly']
		},
		{
			key: 'appointments',
			label: 'Randevular',
			allow: ['owner', 'admin', 'manager', 'agent', 'readonly']
		},
		{ key: 'finance', label: 'Finans / işlemler', allow: ['owner', 'admin', 'manager', 'finance'] },
		{
			key: 'reports',
			label: 'Raporlar',
			allow: ['owner', 'admin', 'manager', 'finance', 'readonly']
		},
		{ key: 'integrations', label: 'Bağlantılar (Ayarlar)', allow: ['owner', 'admin'] },
		{ key: 'team', label: 'Ekip yönetimi', allow: ['owner', 'admin'] },
		{ key: 'settings', label: 'Ayarlar', allow: ['owner', 'admin'] },
		{ key: 'audit', label: 'Denetim kaydı', allow: ['owner', 'admin'] }
	];

	function cell(allow: UserRole[], role: UserRole): boolean {
		return allow.includes(role);
	}
</script>

<svelte:head>
	<title>Erişim · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title="Erişim"
		description="Rol → izin matrisi (demo). Üst bardaki rol değiştirici ile menü görünürlüğünü dene."
	/>

	<div class="overflow-x-auto rounded-lg border border-border bg-surface">
		<table class="w-full min-w-[640px] text-left text-sm">
			<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
				<tr>
					<th class="px-3 py-2.5 font-medium">İzin</th>
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
		Gerçek yetkilendirme Faz 0b’de better-auth organization rolleri ile bağlanacak. Bu tablo
		`rbac.ts` ile uyumlu bir önizleme.
	</p>
</div>

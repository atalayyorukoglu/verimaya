<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { MembershipUser, Tenant, UserRole } from '@verimaya/shared';
	import { userRoleLabels } from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';

	const SELF_EMAIL = 'demo@verimaya.app';

	const queryClient = useQueryClient();
	const { keys } = useQueryScope();
	const roles = Object.keys(userRoleLabels) as UserRole[];

	// Not scoped via `keys` (queryKeys()): this panel intentionally lists/edits *other*
	// tenants by design (superadmin), so tying these to the current tenant/user would be
	// wrong, not safer. See the exception note in `query-keys.ts`.
	const tenantsQuery = createQuery(() => ({
		queryKey: ['dev', 'tenants'],
		queryFn: () => apiGet<{ items: Tenant[] }>('/v1/dev/tenants')
	}));

	const tenants = $derived(tenantsQuery.data?.items ?? []);

	let targetTenantId = $state('');
	let hydratedTarget = $state(false);

	$effect(() => {
		if (hydratedTarget || tenants.length === 0) return;
		targetTenantId = tenants[0]?.id ?? '';
		hydratedTarget = true;
	});

	const usersQuery = createQuery(() => ({
		queryKey: ['dev', 'tenants', targetTenantId, 'users'],
		queryFn: () => apiGet<{ items: MembershipUser[] }>(`/v1/dev/tenants/${targetTenantId}/users`),
		enabled: !!targetTenantId
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
		await queryClient.invalidateQueries({ queryKey: ['dev', 'tenants'] });
	}

	async function refreshUsers() {
		await queryClient.invalidateQueries({ queryKey: ['dev', 'tenants', targetTenantId, 'users'] });
	}

	async function createOrg(e: Event) {
		e.preventDefault();
		const name = newOrgName.trim();
		if (!name) return;
		savingOrg = true;
		error = null;
		try {
			const t = await apiSend<Tenant>('/v1/dev/tenants', 'POST', {
				name,
				grant_self_admin: grantSelf
			});
			newOrgName = '';
			await refreshTenants();
			targetTenantId = t.id;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Organizasyon oluşturulamadı';
		} finally {
			savingOrg = false;
		}
	}

	async function renameOrg(t: Tenant) {
		const name = window.prompt('Yeni organizasyon adı', t.name);
		if (name == null || !name.trim() || name.trim() === t.name) return;
		error = null;
		try {
			await apiSend(`/v1/dev/tenants/${t.id}`, 'PATCH', { name: name.trim() });
			await refreshTenants();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Yeniden adlandırılamadı';
		}
	}

	async function deleteOrg(t: Tenant) {
		if (!window.confirm(`“${t.name}” ve tüm üyelikleri silinsin mi? (demo)`)) return;
		error = null;
		try {
			await apiSend(`/v1/dev/tenants/${t.id}`, 'DELETE');
			if (targetTenantId === t.id) {
				hydratedTarget = false;
				targetTenantId = '';
			}
			await refreshTenants();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Silinemedi';
		}
	}

	async function saveUser(e: Event) {
		e.preventDefault();
		if (!targetTenantId) return;
		savingUser = true;
		error = null;
		try {
			await apiSend(`/v1/dev/tenants/${targetTenantId}/users`, 'POST', {
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
			// This dev-panel action can affect the currently active tenant's membership
			// list (used by settings/team), which since CACHE-01 lives under a scoped key.
			await queryClient.invalidateQueries({ queryKey: keys.members.all() });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Kullanıcı kaydedilemedi';
		} finally {
			savingUser = false;
		}
	}

	async function removeUser(u: MembershipUser) {
		if (u.email === SELF_EMAIL) {
			error = 'Kendi üyeliğini bu ekrandan kaldıramazsın.';
			return;
		}
		if (!window.confirm(`${u.email} bu organizasyondan çıkarılsın mı?`)) return;
		error = null;
		try {
			await apiSend(`/v1/dev/tenants/${targetTenantId}/users/${u.id}`, 'DELETE');
			await refreshUsers();
			// This dev-panel action can affect the currently active tenant's membership
			// list (used by settings/team), which since CACHE-01 lives under a scoped key.
			await queryClient.invalidateQueries({ queryKey: keys.members.all() });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Kaldırılamadı';
		}
	}
</script>

<svelte:head>
	<title>Geliştirici paneli · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0 space-y-8">
	<PageHeader
		title="Geliştirici paneli"
		description="Tüm organizasyonları yönet. Hedef org seçip kullanıcı ekle/çıkar (davet yok — demo)."
	/>

	{#if error}
		<p
			class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
			role="alert"
		>
			{error}
		</p>
	{/if}

	<section>
		<h2 class="text-xs font-semibold tracking-wider text-text-muted uppercase">Organizasyonlar</h2>
		<form
			class="mt-3 flex max-w-xl flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
			onsubmit={createOrg}
		>
			<label class="min-w-[12rem] flex-1 text-xs font-medium text-text-muted">
				Yeni organizasyon adı
				<input class="{fieldClass} mt-1" bind:value={newOrgName} required />
			</label>
			<label class="flex items-center gap-2 text-xs text-text-muted">
				<input type="checkbox" class="cursor-pointer" bind:checked={grantSelf} />
				Beni admin yap
			</label>
			<Button type="submit" disabled={savingOrg}>
				{savingOrg ? '…' : 'Oluştur'}
			</Button>
		</form>

		<div class="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
			{#if tenantsQuery.isPending}
				<p class="p-4 text-sm text-text-muted">Yükleniyor…</p>
			{:else}
				<table class="w-full min-w-[36rem] text-left text-sm">
					<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
						<tr>
							<th class="px-3 py-2 font-medium">Ad</th>
							<th class="px-3 py-2 font-mono font-medium">id</th>
							<th class="px-3 py-2 font-medium"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each tenants as t (t.id)}
							<tr>
								<td class="px-3 py-2 font-medium text-text">{t.name}</td>
								<td class="px-3 py-2 font-mono text-[11px] text-text-faint">{t.id}</td>
								<td class="space-x-3 px-3 py-2 text-right">
									<button
										type="button"
										class="cursor-pointer text-xs font-medium text-brand hover:underline"
										onclick={() => renameOrg(t)}
									>
										Yeniden adlandır
									</button>
									<button
										type="button"
										class="cursor-pointer text-xs font-medium text-danger hover:underline"
										onclick={() => deleteOrg(t)}
									>
										Sil
									</button>
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
			Kullanıcılar (hedef org)
		</h2>
		<p class="mt-1 text-xs text-text-muted">
			Üst bardaki aktif tenant’tan bağımsız: burada herhangi bir org seçip üyelerini yönet.
		</p>
		<label class="mt-3 block max-w-md text-xs font-medium text-text-muted">
			Hedef organizasyon
			<select class="{fieldClass} mt-1" bind:value={targetTenantId}>
				{#each tenants as t (t.id)}
					<option value={t.id}>{t.name}</option>
				{/each}
			</select>
		</label>

		<form
			class="mt-6 max-w-xl space-y-3 rounded-lg border border-border bg-surface p-4"
			onsubmit={saveUser}
		>
			<h3 class="text-sm font-medium text-text">Kullanıcı ekle / güncelle</h3>
			<div class="grid gap-2 sm:grid-cols-2">
				<label class="text-xs font-medium text-text-muted">
					E-posta
					<input class="{fieldClass} mt-1" type="email" bind:value={email} required />
				</label>
				<label class="text-xs font-medium text-text-muted">
					Şifre (≥8)
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
				Görünen ad
				<input class="{fieldClass} mt-1" bind:value={displayName} required />
			</label>
			<label class="block text-xs font-medium text-text-muted">
				Rol
				<select class="{fieldClass} mt-1" bind:value={role}>
					{#each roles as r (r)}
						<option value={r}>{userRoleLabels[r]}</option>
					{/each}
				</select>
			</label>
			<Button type="submit" disabled={savingUser || !targetTenantId}>
				{savingUser ? 'Kaydediliyor…' : 'Ekle / güncelle'}
			</Button>
			<p class="text-[11px] text-text-faint">
				Demo’da şifre saklanmaz; yalnızca doğrulama uzunluğu kontrol edilir.
			</p>
		</form>

		<div class="mt-6">
			<h3 class="text-sm font-medium text-text">Bu org’daki kullanıcılar</h3>
			{#if !targetTenantId}
				<p class="mt-2 text-sm text-text-muted">Önce org seç.</p>
			{:else if usersQuery.isPending}
				<p class="mt-2 text-sm text-text-muted">Yükleniyor…</p>
			{:else}
				<div class="mt-2 overflow-x-auto rounded-lg border border-border bg-surface">
					<table class="w-full min-w-[32rem] text-left text-sm">
						<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
							<tr>
								<th class="px-3 py-2 font-medium">E-posta</th>
								<th class="px-3 py-2 font-medium">Ad</th>
								<th class="px-3 py-2 font-medium">Rol</th>
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
										{#if u.email === SELF_EMAIL}
											<span class="text-xs text-text-faint">(sen)</span>
										{:else}
											<button
												type="button"
												class="cursor-pointer text-xs font-medium text-danger hover:underline"
												onclick={() => removeUser(u)}
											>
												Org’dan çıkar
											</button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					{#if users.length === 0}
						<p class="p-3 text-sm text-text-muted">Bu org’da üye yok.</p>
					{/if}
				</div>
			{/if}
		</div>
	</section>

	<p class="text-xs text-text-faint">
		Tracker: <code class="text-text-muted">/dev-users</code> — yalnızca platform dev e-postası. Verimaya’da
		gerçek erişim Faz 0b’de süper-admin / allowlist ile sınırlanır.
	</p>
</div>

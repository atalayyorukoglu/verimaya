<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { MembershipUser, UserRole } from '@verimaya/shared';
	import { apiPaths, userRoleLabels, userRoleSchema } from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass, labelClass, listUrl } from '$lib/api';
	import { meQueryOptions } from '$lib/me-query';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDate } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
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
	const roleOptions = $derived(userRoleSchema.options);

	let savingId = $state<string | null>(null);
	let resettingId = $state<string | null>(null);
	let removingId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);

	let inviteOpen = $state(false);
	let inviteEmail = $state('');
	let inviteName = $state('');
	let inviteRole = $state<UserRole>('agent');
	let invitePassword = $state('');
	let inviteSaving = $state(false);
	let inviteError = $state<string | null>(null);

	let passwordMember = $state<MembershipUser | null>(null);
	let passwordOpen = $state(false);
	let passwordValue = $state('');
	let passwordSaving = $state(false);
	let passwordError = $state<string | null>(null);

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

	/** /v1/me.id is user.id; list items use membership id — match on email for "self". */
	function isSelf(member: MembershipUser): boolean {
		return me != null && member.email === me.email;
	}

	function openInvite() {
		inviteEmail = '';
		inviteName = '';
		inviteRole = 'agent';
		invitePassword = '';
		inviteError = null;
		inviteOpen = true;
	}

	function openSetPassword(member: MembershipUser) {
		passwordMember = member;
		passwordValue = '';
		passwordError = null;
		passwordOpen = true;
	}

	function closeSetPassword() {
		passwordOpen = false;
		passwordMember = null;
		passwordValue = '';
		passwordError = null;
	}

	async function changeRole(member: MembershipUser, role: UserRole) {
		if (!canManageRoles || isSelf(member) || member.role === role) return;
		savingId = member.id;
		error = null;
		try {
			await apiSend(apiPaths.member(member.id), 'PATCH', { role });
			await queryClient.invalidateQueries({ queryKey: qs.keys.members.all() });
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.team.roleUpdateError');
		} finally {
			savingId = null;
		}
	}

	async function submitInvite(e: Event) {
		e.preventDefault();
		if (!canManageRoles || inviteSaving) return;
		inviteSaving = true;
		inviteError = null;
		error = null;
		try {
			await apiSend(apiPaths.members, 'POST', {
				email: inviteEmail.trim(),
				display_name: inviteName.trim(),
				role: inviteRole,
				password: invitePassword
			});
			await queryClient.invalidateQueries({ queryKey: qs.keys.members.all() });
			inviteOpen = false;
		} catch (err) {
			inviteError = err instanceof Error ? err.message : t('settings.team.inviteFailed');
		} finally {
			inviteSaving = false;
		}
	}

	async function submitSetPassword(e: Event) {
		e.preventDefault();
		const member = passwordMember;
		if (!member || !canManageRoles || isSelf(member) || passwordSaving) return;
		passwordSaving = true;
		passwordError = null;
		error = null;
		notice = null;
		try {
			await apiSend(apiPaths.member(member.id), 'PATCH', { password: passwordValue });
			notice = t('settings.team.setPasswordDone');
			closeSetPassword();
		} catch (err) {
			passwordError = err instanceof Error ? err.message : t('settings.team.setPasswordFailed');
		} finally {
			passwordSaving = false;
		}
	}

	async function sendReset(member: MembershipUser) {
		if (!canManageRoles || isSelf(member)) return;
		if (!confirm(t('settings.team.resetPasswordConfirm', { name: member.display_name }))) return;
		resettingId = member.id;
		error = null;
		notice = null;
		try {
			await apiSend(apiPaths.memberPasswordReset(member.id), 'POST');
			notice = t('settings.team.resetPasswordSent');
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.team.resetPasswordFailed');
		} finally {
			resettingId = null;
		}
	}

	async function removeMember(member: MembershipUser) {
		if (!canManageRoles || isSelf(member)) return;
		if (!confirm(t('settings.team.removeConfirm', { name: member.display_name }))) return;
		removingId = member.id;
		error = null;
		try {
			await apiSend(apiPaths.member(member.id), 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.members.all() });
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.team.removeFailed');
		} finally {
			removingId = null;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.team.title')} · {t('nav.settings')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<SettingsBackLink />
	<PageHeader title={t('settings.team.title')} description={t('settings.team.description')}>
		{#snippet actions()}
			{#if canManageRoles}
				<Button type="button" onclick={openInvite}>{t('settings.team.invite')}</Button>
			{/if}
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
		{#if error}
			<p class="mb-3 text-sm text-danger" role="alert">{error}</p>
		{/if}
		{#if notice}
			<p class="mb-3 text-sm text-success" role="status">{notice}</p>
		{/if}
		<ul
			class="min-w-0 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
		>
			{#each members as member (member.id)}
				<li class="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3">
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
						<button
							type="button"
							class="shrink-0 text-xs font-medium text-brand hover:underline disabled:opacity-50"
							disabled={passwordSaving && passwordMember?.id === member.id}
							onclick={() => openSetPassword(member)}
						>
							{t('settings.team.setPassword')}
						</button>
						<button
							type="button"
							class="shrink-0 text-xs font-medium text-brand hover:underline disabled:opacity-50"
							disabled={resettingId === member.id}
							onclick={() => void sendReset(member)}
						>
							{resettingId === member.id ? t('common.wait') : t('settings.team.resetPassword')}
						</button>
						<button
							type="button"
							class="shrink-0 text-xs font-medium text-danger hover:underline disabled:opacity-50"
							disabled={removingId === member.id}
							onclick={() => void removeMember(member)}
						>
							{removingId === member.id ? t('common.wait') : t('settings.team.remove')}
						</button>
						<label class="sr-only" for={`role-${member.id}`}>{t('settings.team.roleLabel')}</label>
						<select
							id={`role-${member.id}`}
							class={`${fieldClass} w-auto min-w-[8.5rem] py-1.5 text-xs`}
							value={member.role}
							disabled={savingId === member.id}
							onchange={(e) => {
								const next = userRoleSchema.safeParse(e.currentTarget.value);
								if (next.success) void changeRole(member, next.data);
							}}
						>
							{#each roleOptions as role (role)}
								<option value={role}>{userRoleLabels[role]}</option>
							{/each}
						</select>
					{:else}
						<span title={isSelf(member) ? t('settings.team.roleSelfDisabled') : undefined}>
							<StatusBadge label={userRoleLabels[member.role]} tone={roleTone(member.role)} />
						</span>
					{/if}
				</li>
			{/each}
		</ul>

		<p class="mt-4 text-xs text-text-faint">
			{t('settings.team.footnote')}
		</p>
	{/if}
</div>

<Dialog
	bind:open={inviteOpen}
	title={t('settings.team.inviteTitle')}
	description={t('settings.team.inviteDescription')}
>
	<form class="grid gap-3" onsubmit={submitInvite}>
		{#if inviteError}
			<p class="text-sm text-danger" role="alert">{inviteError}</p>
		{/if}
		<label class="grid gap-1">
			<span class={labelClass}>{t('settings.team.emailLabel')}</span>
			<input
				class={fieldClass}
				type="email"
				bind:value={inviteEmail}
				required
				maxlength="255"
				autocomplete="off"
			/>
		</label>
		<label class="grid gap-1">
			<span class={labelClass}>{t('settings.team.nameLabel')}</span>
			<input
				class={fieldClass}
				type="text"
				bind:value={inviteName}
				required
				maxlength="255"
				autocomplete="off"
			/>
		</label>
		<label class="grid gap-1">
			<span class={labelClass}>{t('settings.team.roleLabel')}</span>
			<select class={fieldClass} bind:value={inviteRole}>
				{#each roleOptions as role (role)}
					<option value={role}>{userRoleLabels[role]}</option>
				{/each}
			</select>
		</label>
		<label class="grid gap-1">
			<span class={labelClass}>{t('settings.team.passwordLabel')}</span>
			<input
				class={fieldClass}
				type="password"
				bind:value={invitePassword}
				required
				minlength="8"
				maxlength="128"
				autocomplete="new-password"
			/>
			<span class="text-xs text-text-faint">{t('settings.team.passwordHint')}</span>
		</label>
		<div class="mt-2 flex justify-end gap-2">
			<Button type="button" variant="outline" onclick={() => (inviteOpen = false)}>
				{t('common.cancel')}
			</Button>
			<Button type="submit" disabled={inviteSaving}>
				{inviteSaving ? t('common.creating') : t('settings.team.inviteSubmit')}
			</Button>
		</div>
	</form>
</Dialog>

{#if passwordMember}
	<Dialog
		bind:open={passwordOpen}
		title={t('settings.team.setPasswordTitle')}
		description={t('settings.team.setPasswordDescription', { name: passwordMember.display_name })}
	>
		<form class="grid gap-3" onsubmit={submitSetPassword}>
			{#if passwordError}
				<p class="text-sm text-danger" role="alert">{passwordError}</p>
			{/if}
			<label class="grid gap-1">
				<span class={labelClass}>{t('settings.team.passwordLabel')}</span>
				<input
					class={fieldClass}
					type="password"
					bind:value={passwordValue}
					required
					minlength="8"
					maxlength="128"
					autocomplete="new-password"
				/>
				<span class="text-xs text-text-faint">{t('settings.team.passwordHint')}</span>
			</label>
			<div class="mt-2 flex justify-end gap-2">
				<Button type="button" variant="outline" onclick={closeSetPassword}>
					{t('common.cancel')}
				</Button>
				<Button type="submit" disabled={passwordSaving}>
					{passwordSaving ? t('common.saving') : t('settings.team.setPasswordSubmit')}
				</Button>
			</div>
		</form>
	</Dialog>
{/if}

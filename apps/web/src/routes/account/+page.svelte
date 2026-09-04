<script lang="ts">
	import { useQueryClient } from '@tanstack/svelte-query';
	import { t } from '$lib/i18n/locale.svelte';
	import { fieldClass, labelClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { authClient } from '$lib/auth';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { Button } from '$lib/components/ui/button';

	const queryClient = useQueryClient();
	const qs = useQueryScope();
	const me = $derived(qs.meQuery.data);
	const mePending = $derived(qs.meQuery.isPending);

	let currentPassword = $state('');
	let newPassword = $state('');
	let newPassword2 = $state('');
	let passwordBusy = $state(false);
	let passwordError = $state<string | null>(null);
	let passwordOk = $state(false);

	async function submitPasswordChange(e: Event) {
		e.preventDefault();
		if (newPassword !== newPassword2) {
			passwordError = t('shell.password.mismatch');
			return;
		}
		if (newPassword.length < 8) {
			passwordError = t('shell.password.tooShort');
			return;
		}
		passwordBusy = true;
		passwordError = null;
		passwordOk = false;
		try {
			const { error } = await authClient.changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions: true
			});
			if (error) {
				passwordError = error.message || t('shell.password.failed');
				return;
			}
			currentPassword = '';
			newPassword = '';
			newPassword2 = '';
			passwordOk = true;
			await queryClient.invalidateQueries({ queryKey: ['me'] });
		} catch (err) {
			passwordError = err instanceof Error ? err.message : t('shell.password.failed');
		} finally {
			passwordBusy = false;
		}
	}
</script>

<svelte:head>
	<title>{t('account.title')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader title={t('account.title')} description={t('account.description')} />

	<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
		<h2 class="text-sm font-semibold text-text">{t('account.profile.heading')}</h2>
		<p class="mt-1 text-xs text-text-faint">{t('account.profile.hint')}</p>
		{#if mePending}
			<div class="mt-4 space-y-3" aria-hidden="true">
				<div class="h-9 animate-pulse rounded-md bg-surface-2"></div>
				<div class="h-9 animate-pulse rounded-md bg-surface-2"></div>
			</div>
		{:else}
			<dl class="mt-4 grid gap-4 sm:grid-cols-2">
				<div>
					<dt class={labelClass}>{t('account.profile.displayName')}</dt>
					<dd class="mt-1 text-sm text-text">{me?.display_name ?? '—'}</dd>
				</div>
				<div>
					<dt class={labelClass}>{t('account.profile.email')}</dt>
					<dd class="mt-1 text-sm break-all text-text">{me?.email ?? '—'}</dd>
				</div>
			</dl>
		{/if}
	</section>

	<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
		<h2 class="text-sm font-semibold text-text">{t('shell.password.title')}</h2>
		<p class="mt-1 text-xs text-text-faint">{t('shell.password.description')}</p>
		<form class="mt-4 space-y-3" onsubmit={submitPasswordChange}>
			<div>
				<label class={labelClass} for="account-pw-current">{t('shell.password.current')}</label>
				<input
					id="account-pw-current"
					type="password"
					autocomplete="current-password"
					required
					bind:value={currentPassword}
					class={fieldClass}
				/>
			</div>
			<div>
				<label class={labelClass} for="account-pw-new">{t('shell.password.new')}</label>
				<input
					id="account-pw-new"
					type="password"
					autocomplete="new-password"
					required
					minlength="8"
					bind:value={newPassword}
					class={fieldClass}
				/>
			</div>
			<div>
				<label class={labelClass} for="account-pw-new2">{t('shell.password.confirm')}</label>
				<input
					id="account-pw-new2"
					type="password"
					autocomplete="new-password"
					required
					minlength="8"
					bind:value={newPassword2}
					class={fieldClass}
				/>
			</div>
			{#if passwordError}
				<p class="text-sm text-danger" role="alert">{passwordError}</p>
			{/if}
			{#if passwordOk}
				<p class="text-sm text-success" role="status">{t('shell.password.success')}</p>
			{/if}
			<Button type="submit" disabled={passwordBusy}>
				{passwordBusy ? t('common.wait') : t('shell.password.submit')}
			</Button>
		</form>
	</section>

	<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
		<h2 class="text-sm font-semibold text-text">{t('account.theme.heading')}</h2>
		<p class="mt-1 text-xs text-text-faint">{t('account.theme.hint')}</p>
		<div class="mt-3 max-w-xs rounded-md border border-border">
			<ThemeToggle variant="nav" />
		</div>
	</section>

	<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
		<h2 class="text-sm font-semibold text-text">{t('account.notifications.heading')}</h2>
		<p class="mt-1 text-sm text-text-muted">{t('account.notifications.soon')}</p>
	</section>
</div>

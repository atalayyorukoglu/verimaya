<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import SiteLogo from '$lib/components/SiteLogo.svelte';
	import { Button } from '$lib/components/ui/button';
	import { authClient } from '$lib/auth';
	import { fieldClass, labelClass } from '$lib/api';
	import { t } from '$lib/i18n/locale.svelte';

	type Mode = 'request' | 'reset' | 'sent';

	const token = $derived(page.url.searchParams.get('token')?.trim() || '');
	const tokenError = $derived(page.url.searchParams.get('error')?.trim() || '');

	let mode = $state<Mode>('request');
	let email = $state('');
	let password = $state('');
	let password2 = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (tokenError) {
			error = t('login.reset.invalidToken');
			mode = 'request';
			return;
		}
		if (token) mode = 'reset';
	});

	async function submitRequest(e: Event) {
		e.preventDefault();
		loading = true;
		error = null;
		try {
			const { error: reqError } = await authClient.requestPasswordReset({
				email: email.trim().toLowerCase(),
				redirectTo: `${window.location.origin}/reset-password`
			});
			if (reqError) {
				error = reqError.message || t('login.reset.requestFailed');
				return;
			}
			mode = 'sent';
		} catch (err) {
			error = err instanceof Error ? err.message : t('login.reset.requestFailed');
		} finally {
			loading = false;
		}
	}

	async function submitReset(e: Event) {
		e.preventDefault();
		if (password !== password2) {
			error = t('login.reset.mismatch');
			return;
		}
		if (password.length < 8) {
			error = t('login.reset.tooShort');
			return;
		}
		loading = true;
		error = null;
		try {
			const { error: resetError } = await authClient.resetPassword({
				newPassword: password,
				token
			});
			if (resetError) {
				error = resetError.message || t('login.reset.failed');
				return;
			}
			await goto('/login', { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : t('login.reset.failed');
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>{t('login.reset.documentTitle')}</title>
</svelte:head>

<div class="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12">
	<div class="w-full max-w-sm">
		<div class="mb-8 flex justify-center">
			<SiteLogo class="w-fit" />
		</div>

		<div class="rounded-lg border border-border bg-surface p-6 shadow-sm">
			{#if mode === 'sent'}
				<h1 class="text-lg font-semibold text-text">{t('login.reset.sentTitle')}</h1>
				<p class="mt-2 text-sm text-text-muted">{t('login.reset.sentBody')}</p>
				<a href="/login" class="mt-6 inline-block text-sm font-medium text-brand hover:underline"
					>{t('login.reset.backToLogin')}</a
				>
			{:else if mode === 'reset'}
				<h1 class="text-lg font-semibold text-text">{t('login.reset.newTitle')}</h1>
				<p class="mt-1 text-sm text-text-muted">{t('login.reset.newDesc')}</p>
				<form class="mt-6 space-y-4" onsubmit={submitReset}>
					<div>
						<label class={labelClass} for="npw">{t('login.reset.newPassword')}</label>
						<input
							id="npw"
							type="password"
							autocomplete="new-password"
							required
							minlength="8"
							bind:value={password}
							class={fieldClass}
						/>
					</div>
					<div>
						<label class={labelClass} for="npw2">{t('login.reset.confirmPassword')}</label>
						<input
							id="npw2"
							type="password"
							autocomplete="new-password"
							required
							minlength="8"
							bind:value={password2}
							class={fieldClass}
						/>
					</div>
					{#if error}
						<p class="text-sm text-danger" role="alert">{error}</p>
					{/if}
					<Button type="submit" class="w-full" disabled={loading}>
						{loading ? t('common.wait') : t('login.reset.submitNew')}
					</Button>
				</form>
			{:else}
				<h1 class="text-lg font-semibold text-text">{t('login.reset.requestTitle')}</h1>
				<p class="mt-1 text-sm text-text-muted">{t('login.reset.requestDesc')}</p>
				<form class="mt-6 space-y-4" onsubmit={submitRequest}>
					<div>
						<label class={labelClass} for="email">{t('login.email')}</label>
						<input
							id="email"
							type="email"
							autocomplete="email"
							required
							bind:value={email}
							class={fieldClass}
						/>
					</div>
					{#if error}
						<p class="text-sm text-danger" role="alert">{error}</p>
					{/if}
					<Button type="submit" class="w-full" disabled={loading}>
						{loading ? t('common.wait') : t('login.reset.sendLink')}
					</Button>
				</form>
				<a href="/login" class="mt-4 inline-block text-sm text-text-muted hover:text-text"
					>{t('login.reset.backToLogin')}</a
				>
			{/if}
		</div>
	</div>
</div>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { useQueryClient } from '@tanstack/svelte-query';
	import SiteLogo from '$lib/components/SiteLogo.svelte';
	import { Button } from '$lib/components/ui/button';
	import { authClient } from '$lib/auth';
	import { resetQueryScope } from '$lib/query-scope.svelte';
	import { PUBLIC_SITE_URL } from '$lib/env';
	import {
		checkOrganizationGate,
		createOrganization,
		setActiveOrganization,
		slugifyOrganizationName,
		type OrganizationSummary
	} from '$lib/auth-org';
	import { fieldClass, labelClass } from '$lib/api';
	import { t } from '$lib/i18n/locale.svelte';

	type Step = 'credentials' | 'twoFactor' | 'orgPick' | 'orgCreate';

	let email = $state('');
	let password = $state('');
	let totpCode = $state('');
	let step = $state<Step>('credentials');
	let loading = $state(false);
	let error = $state<string | null>(null);

	let orgOptions = $state<OrganizationSummary[]>([]);
	let selectedOrgId = $state('');
	let orgName = $state('');
	let orgSlug = $state('');

	const queryClient = useQueryClient();

	/**
	 * Cancel in-flight queries then clear all cached queries before entering the
	 * panel — a browser tab may have stale data from a previous session/organization
	 * (AUTH-01E / CACHE-01). GET /v1/me and every tenant-scoped query must refetch
	 * under the new session.
	 */
	async function clearSessionCache() {
		await resetQueryScope(queryClient);
	}

	async function finishAuth() {
		await clearSessionCache();
		const gate = await checkOrganizationGate();
		if (gate.action === 'proceed') {
			await goto('/');
			return;
		}
		if (gate.action === 'pick') {
			orgOptions = gate.organizations;
			selectedOrgId = gate.organizations[0]?.id ?? '';
			step = 'orgPick';
			return;
		}
		step = 'orgCreate';
	}

	async function submitLogin(e: Event) {
		e.preventDefault();
		loading = true;
		error = null;

		try {
			if (step === 'twoFactor') {
				const { error: verifyError } = await authClient.twoFactor.verifyTotp({
					code: totpCode.trim()
				});
				if (verifyError) {
					error = verifyError.message ?? t('login.error.invalidCode');
					return;
				}
				await finishAuth();
				return;
			}

			const { data, error: signInError } = await authClient.signIn.email({
				email: email.trim(),
				password
			});

			if (signInError) {
				const detail = [signInError.message, signInError.code].filter(Boolean).join(' · ');
				error = detail || t('login.error.signInFailed');
				return;
			}

			const signInData = data as typeof data & { twoFactorRedirect?: boolean };
			if (signInData?.twoFactorRedirect) {
				step = 'twoFactor';
				error = null;
				return;
			}

			await finishAuth();
		} catch (err) {
			error = err instanceof Error ? err.message : t('login.error.signInFailed');
		} finally {
			loading = false;
		}
	}

	async function submitOrgPick(e: Event) {
		e.preventDefault();
		if (!selectedOrgId) return;
		loading = true;
		error = null;
		try {
			await setActiveOrganization(selectedOrgId);
			await clearSessionCache();
			await goto('/');
		} catch (err) {
			error = err instanceof Error ? err.message : t('login.error.orgSelectFailed');
		} finally {
			loading = false;
		}
	}

	async function submitOrgCreate(e: Event) {
		e.preventDefault();
		const name = orgName.trim();
		const slug = (orgSlug.trim() || slugifyOrganizationName(name)).slice(0, 48);
		if (!name || !slug) {
			error = t('login.error.orgNameRequired');
			return;
		}
		loading = true;
		error = null;
		try {
			const org = await createOrganization(name, slug);
			await setActiveOrganization(org.id);
			await clearSessionCache();
			await goto('/');
		} catch (err) {
			error = err instanceof Error ? err.message : t('login.error.orgCreateFailed');
		} finally {
			loading = false;
		}
	}

	const title = $derived(
		step === 'twoFactor'
			? t('login.title.twoFactor')
			: step === 'orgPick'
				? t('login.title.chooseOrg')
				: step === 'orgCreate'
					? t('login.title.createOrg')
					: t('login.title.signIn')
	);

	const subtitle = $derived(
		step === 'twoFactor'
			? t('login.desc.twoFactor')
			: step === 'orgPick'
				? t('login.desc.chooseOrg')
				: step === 'orgCreate'
					? t('login.desc.createOrg')
					: t('login.desc.signIn')
	);
</script>

<svelte:head>
	<title>{t('login.documentTitle')}</title>
</svelte:head>

<div class="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12">
	<div class="w-full max-w-sm">
		<div class="mb-8 flex justify-center">
			<SiteLogo class="w-fit" />
		</div>

		<div class="rounded-lg border border-border bg-surface p-6 shadow-sm">
			<h1 class="text-lg font-semibold text-text">{title}</h1>
			<p class="mt-1 text-sm text-text-muted">{subtitle}</p>

			{#if step === 'orgPick'}
				<form class="mt-6 space-y-4" onsubmit={submitOrgPick}>
					<ul class="space-y-2">
						{#each orgOptions as org (org.id)}
							<li>
								<label
									class="flex cursor-pointer items-center gap-3 rounded-[6px] border border-border px-3 py-2.5 transition-colors hover:bg-surface-2 has-checked:border-brand has-checked:bg-brand/5"
								>
									<input
										type="radio"
										name="org"
										value={org.id}
										bind:group={selectedOrgId}
										class="size-4"
									/>
									<span class="min-w-0">
										<span class="block truncate text-sm font-medium text-text">{org.name}</span>
										<span class="block truncate text-xs text-text-faint">{org.slug}</span>
									</span>
								</label>
							</li>
						{/each}
					</ul>

					{#if error}
						<p class="text-sm text-danger" role="alert">{error}</p>
					{/if}

					<Button type="submit" class="w-full" disabled={loading || !selectedOrgId}>
						{loading ? t('common.wait') : 'Devam et'}
					</Button>
				</form>
			{:else if step === 'orgCreate'}
				<form class="mt-6 space-y-4" onsubmit={submitOrgCreate}>
					<div>
						<label class={labelClass} for="org-name">{t('login.orgName')}</label>
						<input
							id="org-name"
							type="text"
							required
							bind:value={orgName}
							oninput={() => {
								if (!orgSlug.trim()) orgSlug = slugifyOrganizationName(orgName);
							}}
							class={fieldClass}
							placeholder={t('login.orgNamePlaceholder')}
						/>
					</div>
					<div>
						<label class={labelClass} for="org-slug">{t('login.orgSlug')}</label>
						<input
							id="org-slug"
							type="text"
							required
							bind:value={orgSlug}
							class={fieldClass}
							placeholder="demo-klinik"
						/>
					</div>

					{#if error}
						<p class="text-sm text-danger" role="alert">{error}</p>
					{/if}

					<Button type="submit" class="w-full" disabled={loading}>
						{loading ? t('common.wait') : t('login.createOrg')}
					</Button>
				</form>
			{:else}
				<form class="mt-6 space-y-4" onsubmit={submitLogin}>
					{#if step === 'credentials'}
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
						<div>
							<label class={labelClass} for="password">{t('login.password')}</label>
							<input
								id="password"
								type="password"
								autocomplete="current-password"
								required
								bind:value={password}
								class={fieldClass}
							/>
						</div>
						<p class="text-right text-sm">
							<a href="/reset-password" class="text-brand hover:underline"
								>{t('login.forgotPassword')}</a
							>
						</p>
					{:else}
						<div>
							<label class={labelClass} for="totp">{t('login.totp')}</label>
							<input
								id="totp"
								type="text"
								inputmode="numeric"
								autocomplete="one-time-code"
								required
								maxlength={6}
								bind:value={totpCode}
								class={fieldClass}
							/>
						</div>
					{/if}

					{#if error}
						<p class="text-sm text-danger" role="alert">{error}</p>
					{/if}

					<Button type="submit" class="w-full" disabled={loading}>
						{loading
							? t('common.wait')
							: step === 'twoFactor'
								? t('login.verify')
								: t('login.submit')}
					</Button>

					{#if step === 'twoFactor'}
						<Button
							type="button"
							variant="ghost"
							class="w-full"
							disabled={loading}
							onclick={() => {
								step = 'credentials';
								totpCode = '';
								error = null;
							}}
						>
							{t('login.back')}
						</Button>
					{/if}
				</form>
			{/if}
		</div>

		<p class="mt-6 text-center text-sm text-text-muted">
			<a
				href={PUBLIC_SITE_URL}
				class="text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
			>
				Verimaya nedir?
			</a>
		</p>
	</div>
</div>

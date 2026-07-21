<script lang="ts">
	import { goto } from '$app/navigation';
	import SiteLogo from '$lib/components/SiteLogo.svelte';
	import { Button } from '$lib/components/ui/button';
	import { authClient } from '$lib/auth';
	import { fieldClass, labelClass } from '$lib/api';

	let email = $state('');
	let password = $state('');
	let totpCode = $state('');
	let needsTwoFactor = $state(false);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function submitLogin(e: Event) {
		e.preventDefault();
		loading = true;
		error = null;

		try {
			if (needsTwoFactor) {
				const { error: verifyError } = await authClient.twoFactor.verifyTotp({
					code: totpCode.trim()
				});
				if (verifyError) {
					error = verifyError.message ?? 'Doğrulama kodu geçersiz';
					return;
				}
				await goto('/');
				return;
			}

			const { data, error: signInError } = await authClient.signIn.email({
				email: email.trim(),
				password
			});

			if (signInError) {
				error = signInError.message ?? 'Giriş başarısız';
				return;
			}

			const signInData = data as typeof data & { twoFactorRedirect?: boolean };
			if (signInData?.twoFactorRedirect) {
				needsTwoFactor = true;
				error = null;
				return;
			}

			await goto('/');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Giriş başarısız';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Giriş · Verimaya</title>
</svelte:head>

<div class="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12">
	<div class="w-full max-w-sm">
		<div class="mb-8 flex justify-center">
			<SiteLogo />
		</div>

		<div class="rounded-lg border border-border bg-surface p-6 shadow-sm">
			<h1 class="text-lg font-semibold text-text">
				{needsTwoFactor ? 'İki adımlı doğrulama' : 'Giriş yap'}
			</h1>
			<p class="mt-1 text-sm text-text-muted">
				{#if needsTwoFactor}
					Authenticator uygulamanızdaki 6 haneli kodu girin.
				{:else}
					Verimaya hesabınızla devam edin.
				{/if}
			</p>

			<form class="mt-6 space-y-4" onsubmit={submitLogin}>
				{#if !needsTwoFactor}
					<div>
						<label class={labelClass} for="email">E-posta</label>
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
						<label class={labelClass} for="password">Şifre</label>
						<input
							id="password"
							type="password"
							autocomplete="current-password"
							required
							bind:value={password}
							class={fieldClass}
						/>
					</div>
				{:else}
					<div>
						<label class={labelClass} for="totp">Doğrulama kodu</label>
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
					{loading ? 'Bekleyin…' : needsTwoFactor ? 'Doğrula' : 'Giriş yap'}
				</Button>

				{#if needsTwoFactor}
					<Button
						type="button"
						variant="ghost"
						class="w-full"
						disabled={loading}
						onclick={() => {
							needsTwoFactor = false;
							totpCode = '';
							error = null;
						}}
					>
						Geri dön
					</Button>
				{/if}
			</form>
		</div>
	</div>
</div>

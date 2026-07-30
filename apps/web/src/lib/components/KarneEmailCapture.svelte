<script lang="ts">
	import type { IntakeBandId, IntakeEuId } from '$lib/karne/questions';
	import { submitKarneLead } from '$lib/karne/telemetry';

	let {
		band,
		eu,
		onsuccess
	}: {
		band: IntakeBandId;
		eu: IntakeEuId;
		onsuccess?: () => void;
	} = $props();

	let email = $state('');
	let consent = $state(false);
	/** Honeypot — hidden from humans. */
	let website = $state('');
	let submitting = $state(false);
	let done = $state(false);
	let errorMsg = $state<string | null>(null);

	const canSubmit = $derived(
		!submitting && !done && consent && email.trim().length > 0 && email.includes('@')
	);

	async function onSubmit(e: Event) {
		e.preventDefault();
		if (!canSubmit) return;
		submitting = true;
		errorMsg = null;
		const result = await submitKarneLead({
			email,
			consent: true,
			website,
			band,
			eu_exposure: eu
		});
		submitting = false;
		if (result.ok) {
			done = true;
			onsuccess?.();
			return;
		}
		errorMsg =
			result.reason === 'validation'
				? 'E-posta veya onay eksik görünüyor. Kontrol edip yeniden deneyin.'
				: 'Şu an gönderilemedi. Biraz sonra yeniden deneyebilirsiniz.';
	}
</script>

<section class="space-y-4" aria-labelledby="karne-email-heading">
	<h2 id="karne-email-heading" class="text-sm font-semibold tracking-tight text-text">
		Detaylı raporu e-posta ile alın
	</h2>
	<p class="text-sm leading-relaxed text-text-muted">
		İsterseniz özeti e-posta adresinize gönderelim. Zorunlu değil.
	</p>

	{#if done}
		<p class="text-sm font-medium text-text" role="status">Teşekkürler — kaydınız alındı.</p>
	{:else}
		<form class="relative space-y-4" onsubmit={onSubmit}>
			<!-- honeypot -->
			<div class="pointer-events-none absolute -left-[9999px] h-px w-px overflow-hidden opacity-0" aria-hidden="true">
				<label>
					Website
					<input
						type="text"
						name="website"
						tabindex="-1"
						autocomplete="off"
						bind:value={website}
					/>
				</label>
			</div>

			<label class="block space-y-2">
				<span class="text-sm font-medium text-text">E-posta</span>
				<input
					type="email"
					name="email"
					autocomplete="email"
					required
					bind:value={email}
					class="flex h-11 w-full rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-ring"
					placeholder="ornek@klinik.com"
				/>
			</label>

			<label class="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-text">
				<input
					type="checkbox"
					class="mt-1 size-4 shrink-0 accent-[var(--brand)]"
					bind:checked={consent}
				/>
				<span>
					Kişisel verilerimin
					<a
						href="/kvkk-aydinlatma/"
						class="font-medium text-brand underline-offset-2 hover:underline"
						target="_blank"
						rel="noopener noreferrer"
					>
						aydınlatma metni
					</a>
					kapsamında işlenmesini kabul ediyorum.
				</span>
			</label>

			{#if errorMsg}
				<p class="text-sm text-danger" role="alert">{errorMsg}</p>
			{/if}

			<button
				type="submit"
				disabled={!canSubmit}
				class="inline-flex h-11 min-w-40 items-center justify-center rounded-[6px] bg-brand px-6 text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
			>
				{submitting ? 'Gönderiliyor…' : 'Gönder'}
			</button>
		</form>
	{/if}
</section>

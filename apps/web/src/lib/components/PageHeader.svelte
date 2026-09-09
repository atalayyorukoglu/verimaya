<script lang="ts">
	import type { Snippet } from 'svelte';
	import Info from '@lucide/svelte/icons/info';
	import HelpSheet from '$lib/components/HelpSheet.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { HelpTopic } from '$lib/help-content';

	let {
		title,
		description,
		actions,
		titleTrailing,
		helpTopic
	}: {
		title: string;
		description?: string;
		actions?: Snippet;
		/** Başlığın **sağında**, aynı satırda duran denetim (Raporlar'da mobil karşılaştırma kutusu). */
		titleTrailing?: Snippet;
		/** Verilirse başlığın yanına ⓘ düğmesi çıkar; içerik `help-content.ts`'ten gelir. */
		helpTopic?: HelpTopic;
	} = $props();

	let helpOpen = $state(false);
</script>

<!--
	`flex-wrap` + başlığa `flex-1`: eylemler sığmadığında alt satıra iner.
	Öncesinde eylem bloğu `shrink-0` olduğu için başlık sütunu eziliyordu —
	Finans'a üçüncü düğme eklenince "İşlemler" harf harf alt alta düştü
	(kullanıcı, 2026-09-09). Sığdığı ekranlarda düzen değişmez.
-->
<div class="mb-6 flex flex-row flex-wrap items-center justify-between gap-3">
	<div class="flex min-w-0 flex-1 items-center gap-3">
		<div class="min-w-0">
			<h1
				class="flex items-center gap-1.5 text-base leading-tight font-semibold tracking-tight break-words text-text sm:text-xl"
			>
				<span class="min-w-0 break-words">{title}</span>
				{#if helpTopic}
					<button
						type="button"
						class="shrink-0 rounded-full p-1 text-text-faint hover:bg-surface-2 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
						aria-label={t('help.open')}
						onclick={() => (helpOpen = true)}
					>
						<Info class="size-4" />
					</button>
				{/if}
			</h1>
			{#if description}
				<!--
					Başlık ile açıklama arası sıkı (kullanıcı, 2026-09-09: "çok uzak").
					Görünen boşluğun çoğu kutu payından değil satır yüksekliğinden
					geliyordu: 16px yazı 24px satırda, 14px yazı 20px satırda.
					`leading-tight` ikisini de daraltır, `mt-0.5` payı 2px'e indirir.
				-->
				<p class="mt-0.5 text-sm leading-tight break-words text-text-muted">{description}</p>
			{/if}
		</div>
		{#if titleTrailing}
			<!-- Adı üzerinde: başlık satırının SONUNDA durur (kullanıcı, 2026-09-09). -->
			<div class="ms-auto min-w-0 shrink">{@render titleTrailing()}</div>
		{/if}
	</div>
	<!--
		Mobilde eylemler DAİMA kendi satırında (kullanıcı, 2026-09-09: "başlık -
		düğmeler Randevular gibi alt alta"). `flex-wrap` tek başına yetmiyordu:
		düğmeler "neredeyse" sığdığında satır kırılmıyor, `min-w-0` olan başlık
		eziliyor ve harf harf alt alta akıyordu — 414/430px'te (iPhone Pro Max)
		tam olarak bu oluyordu. `basis-full` aritmetiğe bırakmadan kırıyor.
	-->
	{#if actions}
		<div
			class="flex shrink-0 flex-wrap items-center gap-2 max-md:w-full max-md:basis-full max-md:justify-start md:justify-end"
		>
			{@render actions()}
		</div>
	{/if}
</div>

{#if helpTopic}
	<HelpSheet bind:open={helpOpen} topic={helpTopic} />
{/if}

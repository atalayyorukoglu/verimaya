<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import { labelClass, textareaClass } from '$lib/api';

	const STORAGE_KEY = 'verimaya:ai-prompt';
	const DEFAULT_PROMPT = `WhatsApp grup mesajından finans işlemi çıkar.
Kurallar:
- Tutarı minor unit (kuruş/cent) olarak düşünme; kullanıcıya major göster.
- Tür: income veya expense.
- Varsa hasta adı, kategori, alt kategori, kişi/firma etiketi, tarih.
- Belirsiz alanları boş bırak; uydurma.`;

	let value = $state('');
	let savedOk = $state(false);
	let isDefault = $state(true);

	$effect(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			value = stored;
			isDefault = false;
		} else {
			value = DEFAULT_PROMPT;
			isDefault = true;
		}
	});

	function save() {
		localStorage.setItem(STORAGE_KEY, value);
		isDefault = false;
		savedOk = true;
		setTimeout(() => (savedOk = false), 2000);
	}

	function reset() {
		localStorage.removeItem(STORAGE_KEY);
		value = DEFAULT_PROMPT;
		isDefault = true;
		savedOk = true;
		setTimeout(() => (savedOk = false), 2000);
	}
</script>

<svelte:head>
	<title>AI ayarları · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title="AI ayarları"
		description="WhatsApp işlem aktarımı için sistem prompt’u (demo: localStorage)."
	/>

	<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
		<label class="grid gap-1">
			<span class={labelClass}>
				Prompt
				{#if isDefault}
					<span class="font-normal text-text-faint">(varsayılan)</span>
				{/if}
			</span>
			<textarea class="{textareaClass} min-h-48 font-mono text-xs" bind:value={value}></textarea>
		</label>
		<div class="mt-4 flex flex-wrap items-center gap-2">
			<Button type="button" onclick={save}>Kaydet</Button>
			<Button type="button" variant="outline" onclick={reset}>Varsayılana dön</Button>
			{#if savedOk}
				<span class="text-sm text-success">Kaydedildi.</span>
			{/if}
		</div>
	</section>

	<p class="mt-3 text-xs text-text-faint">
		Gerçek prompt tenant ayarında saklanır (Faz 3). Demo parse hâlâ heuristic; bu metin UI prova.
	</p>
</div>

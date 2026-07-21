<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
</script>

<svelte:head>
	<title>İçe / dışa aktar · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title="İçe / dışa aktar"
		description="Contacts, hastalar, randevular, işlemler — önizle sonra uygula."
	/>
	<div class="rounded-lg border border-border bg-surface p-6 sm:p-8 text-center">
		<p class="text-sm font-medium text-text">Faz 8’de</p>
		<p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
			Tracker’daki import/export/delete Ayarlar’a gömülüydü ve toplu silme riskliydi. Verimaya’da ETL
			+ kontrollü migrasyon; bu ekran şimdilik yer tutucu.
		</p>
		<a
			href="/ozellikler"
			class="mt-5 inline-flex h-9 items-center rounded-[6px] bg-surface-2 px-4 text-sm font-medium text-text hover:bg-border"
		>
			Özelliklere bak
		</a>
	</div>
</div>

<script lang="ts">
	import { getLocale, setLocale, t } from '$lib/i18n/locale.svelte';
	import Languages from '@lucide/svelte/icons/languages';

	const locale = $derived(getLocale());
	const nextLocale = $derived(locale === 'tr' ? 'en' : 'tr');
	const nextLabel = $derived(nextLocale.toUpperCase());

	function onToggle() {
		setLocale(nextLocale);
	}
</script>

<button
	type="button"
	data-hub-locale-toggle
	data-label-to-en={t('locale.toEn')}
	data-label-to-tr={t('locale.toTr')}
	class="inline-flex items-center gap-1.5 rounded-[6px] p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
	aria-label={nextLocale === 'en' ? t('locale.toEn') : t('locale.toTr')}
	title={nextLocale === 'en' ? t('locale.en') : t('locale.tr')}
	onclick={onToggle}
>
	<Languages class="size-5" aria-hidden="true" />
	<span class="text-xs font-medium tracking-wide" aria-hidden="true">{nextLabel}</span>
</button>

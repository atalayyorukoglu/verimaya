<script lang="ts">
	import { changelog } from '@verimaya/shared';
	import { t } from '$lib/i18n/locale.svelte';

	/** TickPort SidebarVersionFooter — centered version + legal lines below. docs/TASARIM.md */
	const ALBION_URL =
		'https://albionsignature.com/?utm_source=tracker&utm_medium=footer&utm_campaign=verimaya-footer';

	const version = $derived(changelog[0]?.version ?? '0.1.0');
	const year = new Date().getFullYear();
</script>

<div class="flex w-full flex-col gap-2 text-xs text-text-muted">
	<div class="flex w-full items-center justify-center">
		<span>Veri Maya · v{version}</span>
	</div>
	<div class="flex flex-col gap-0.5 leading-snug">
		<p>{t('shell.sidebar.copyright', { year })}</p>
		<p>
			{t('shell.sidebar.brandPrefix')}
			<a
				href={ALBION_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="underline underline-offset-2 hover:text-text"
			>
				{t('shell.sidebar.brandName')}
			</a>
		</p>
	</div>
</div>

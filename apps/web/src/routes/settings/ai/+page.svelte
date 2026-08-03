<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		apiPaths,
		DEFAULT_WHATSAPP_AI_DISCLOSURE_TEXT,
		type WhatsappAiDisclosure
	} from '@verimaya/shared';
	import { apiGet, apiSend, labelClass, textareaClass } from '$lib/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';

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

	let disclosureEnabled = $state(false);
	let disclosureText = $state(DEFAULT_WHATSAPP_AI_DISCLOSURE_TEXT);
	let disclosureSaving = $state(false);
	let disclosureSavedOk = $state(false);
	let disclosureError = $state<string | null>(null);
	let disclosureHydrated = $state(false);

	const queryClient = useQueryClient();

	const disclosureQuery = createQuery(() => ({
		queryKey: ['settings', 'ai-disclosure'],
		queryFn: () => apiGet<WhatsappAiDisclosure>(apiPaths.settingsAiDisclosure)
	}));

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

	$effect(() => {
		const data = disclosureQuery.data;
		if (!data || disclosureHydrated) return;
		disclosureEnabled = data.enabled;
		disclosureText = data.text;
		disclosureHydrated = true;
	});

	function savePrompt() {
		localStorage.setItem(STORAGE_KEY, value);
		isDefault = false;
		savedOk = true;
		setTimeout(() => (savedOk = false), 2000);
	}

	function resetPrompt() {
		localStorage.removeItem(STORAGE_KEY);
		value = DEFAULT_PROMPT;
		isDefault = true;
		savedOk = true;
		setTimeout(() => (savedOk = false), 2000);
	}

	async function saveDisclosure() {
		disclosureSaving = true;
		disclosureError = null;
		try {
			const saved = await apiSend<WhatsappAiDisclosure>(apiPaths.settingsAiDisclosure, 'PUT', {
				enabled: disclosureEnabled,
				text: disclosureText
			});
			disclosureEnabled = saved.enabled;
			disclosureText = saved.text;
			await queryClient.invalidateQueries({ queryKey: ['settings', 'ai-disclosure'] });
			disclosureSavedOk = true;
			setTimeout(() => (disclosureSavedOk = false), 2000);
		} catch (err) {
			disclosureError = err instanceof Error ? err.message : t('settings.ai.disclosure.error');
		} finally {
			disclosureSaving = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.ai.title')} · {t('nav.settings')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader title={t('settings.ai.title')} description={t('settings.ai.description')} />

	<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
		<h2 class="text-sm font-semibold text-text">{t('settings.ai.disclosure.heading')}</h2>
		<p class="mt-1 text-sm text-text-muted">{t('settings.ai.disclosure.why')}</p>

		<label class="mt-4 flex items-start gap-2">
			<input
				type="checkbox"
				class="mt-1 size-4 rounded border-border"
				bind:checked={disclosureEnabled}
				disabled={disclosureQuery.isPending}
			/>
			<span class="text-sm text-text">{t('settings.ai.disclosure.enabled')}</span>
		</label>

		<label class="mt-4 grid gap-1">
			<span class={labelClass}>{t('settings.ai.disclosure.textLabel')}</span>
			<textarea
				class="{textareaClass} min-h-28 text-sm"
				bind:value={disclosureText}
				maxlength={2000}
				disabled={disclosureQuery.isPending}></textarea>
		</label>

		<div class="mt-4 flex flex-wrap items-center gap-2">
			<Button
				type="button"
				onclick={saveDisclosure}
				disabled={disclosureSaving || disclosureQuery.isPending}
			>
				{disclosureSaving ? t('settings.ai.disclosure.saving') : t('settings.ai.disclosure.save')}
			</Button>
			{#if disclosureSavedOk}
				<span class="text-sm text-success">{t('settings.ai.disclosure.saved')}</span>
			{/if}
			{#if disclosureError}
				<span class="text-sm text-danger">{disclosureError}</span>
			{/if}
			{#if disclosureQuery.isError}
				<span class="text-sm text-danger">{t('settings.ai.disclosure.loadError')}</span>
			{/if}
		</div>
		<p class="mt-3 text-xs text-text-faint">{t('settings.ai.disclosure.note')}</p>
	</section>

	<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
		<label class="grid gap-1">
			<span class={labelClass}>
				{t('settings.ai.prompt.label')}
				{#if isDefault}
					<span class="font-normal text-text-faint">({t('settings.ai.prompt.default')})</span>
				{/if}
			</span>
			<textarea class="{textareaClass} min-h-48 font-mono text-xs" bind:value></textarea>
		</label>
		<div class="mt-4 flex flex-wrap items-center gap-2">
			<Button type="button" onclick={savePrompt}>{t('settings.ai.prompt.save')}</Button>
			<Button type="button" variant="outline" onclick={resetPrompt}
				>{t('settings.ai.prompt.reset')}</Button
			>
			{#if savedOk}
				<span class="text-sm text-success">{t('settings.ai.prompt.saved')}</span>
			{/if}
		</div>
	</section>

	<p class="mt-3 text-xs text-text-faint">{t('settings.ai.prompt.footnote')}</p>
</div>

<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		apiPaths,
		KNOWLEDGE_SECTIONS,
		KNOWLEDGE_SECTION_MAX,
		emptyKnowledgeSections,
		type KnowledgeSection,
		type KnowledgeSections,
		type KnowledgeSettings
	} from '@verimaya/shared';
	import { apiGet, apiSend, labelClass, textareaClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	let sections = $state<KnowledgeSections>(emptyKnowledgeSections());
	let hydrated = $state(false);
	let saving = $state(false);
	let resetting = $state(false);
	let savedOk = $state(false);
	let error = $state<string | null>(null);

	const query = createQuery(() => ({
		queryKey: qs.keys.settings.knowledge(),
		queryFn: () => apiGet<KnowledgeSettings>(apiPaths.settingsKnowledge),
		enabled: qs.ready
	}));

	$effect(() => {
		const data = query.data;
		if (!data || hydrated) return;
		sections = { ...data.sections };
		hydrated = true;
	});

	const piiWarnings = $derived(query.data?.pii_warnings ?? []);

	function labelKey(section: KnowledgeSection): MessageKey {
		return `settings.knowledge.section.${section}` as MessageKey;
	}

	function hintKey(section: KnowledgeSection): MessageKey {
		return `settings.knowledge.hint.${section}` as MessageKey;
	}

	function piiKindLabel(kind: 'national_id' | 'phone' | 'email'): string {
		if (kind === 'national_id') return t('settings.knowledge.pii.nationalId');
		if (kind === 'phone') return t('settings.knowledge.pii.phone');
		return t('settings.knowledge.pii.email');
	}

	async function save() {
		saving = true;
		error = null;
		savedOk = false;
		try {
			const saved = await apiSend<KnowledgeSettings>(apiPaths.settingsKnowledge, 'PUT', {
				sections
			});
			sections = { ...saved.sections };
			savedOk = true;
			await queryClient.invalidateQueries({ queryKey: qs.keys.settings.knowledge() });
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.knowledge.saveError');
		} finally {
			saving = false;
		}
	}

	async function reset() {
		if (!confirm(t('settings.knowledge.resetConfirm'))) return;
		resetting = true;
		error = null;
		savedOk = false;
		try {
			const cleared = await apiSend<KnowledgeSettings>(apiPaths.settingsKnowledge, 'DELETE');
			sections = { ...cleared.sections };
			await queryClient.invalidateQueries({ queryKey: qs.keys.settings.knowledge() });
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.knowledge.saveError');
		} finally {
			resetting = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.knowledge.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title={t('settings.knowledge.title')}
		description={t('settings.knowledge.description')}
		helpTopic="knowledge"
	/>

	{#if query.isPending}
		<p class="text-sm text-text-muted">{t('common.loading')}</p>
	{:else if query.isError}
		<p class="text-sm text-danger">{t('settings.knowledge.loadError')}</p>
	{:else}
		{#if piiWarnings.length > 0}
			<div
				class="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text"
				role="status"
			>
				<p class="font-medium text-warning">{t('settings.knowledge.pii.title')}</p>
				<p class="mt-1">{t('settings.knowledge.pii.body')}</p>
				<ul class="mt-2 list-inside list-disc text-text-muted">
					{#each piiWarnings as warning (warning.section + warning.kind)}
						<li>{t(labelKey(warning.section))} — {piiKindLabel(warning.kind)}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if error}
			<p class="mb-3 text-sm text-danger" role="alert">{error}</p>
		{/if}
		{#if savedOk}
			<p class="mb-3 text-sm text-success" role="status">{t('settings.knowledge.saved')}</p>
		{/if}

		<div class="flex flex-col gap-5">
			{#each KNOWLEDGE_SECTIONS as section (section)}
				<div class="rounded-lg border border-border bg-surface p-4 sm:p-5">
					<label class={labelClass} for={`knowledge-${section}`}>
						{t(labelKey(section))}
					</label>
					<p class="mt-1 text-xs text-text-faint">{t(hintKey(section))}</p>
					<textarea
						id={`knowledge-${section}`}
						class="{textareaClass} mt-2"
						rows="5"
						maxlength={KNOWLEDGE_SECTION_MAX}
						bind:value={sections[section]}></textarea>
					<p class="mt-1 text-right text-xs text-text-faint tabular-nums">
						{sections[section].length} / {KNOWLEDGE_SECTION_MAX}
					</p>
				</div>
			{/each}
		</div>

		<div class="mt-5 flex flex-wrap gap-2">
			<Button type="button" disabled={saving} onclick={() => void save()}>
				{saving ? t('common.saving') : t('common.save')}
			</Button>
			<Button type="button" variant="outline" disabled={resetting} onclick={() => void reset()}>
				{resetting ? t('common.wait') : t('settings.knowledge.reset')}
			</Button>
		</div>

		<p class="mt-4 text-xs text-text-faint">{t('settings.knowledge.footnote')}</p>
	{/if}
</div>

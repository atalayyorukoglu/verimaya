<script lang="ts">
	/*
	 * KISI-02 — Hasta akışı şablonu.
	 *
	 * İki parça: (1) serbest metin anlatı, (2) yapılandırılmış kontrol listesi.
	 * Kişi türü Hasta olan kayıtların AI özeti üretilirken ikisi de model istemine
	 * bağlam olarak eklenir; listede karşılığı bulunamayan maddeler özet kartında
	 * "Eksik" bloğu olur. Kaydedilmemişse sunucu gömülü varsayılanı döner.
	 */
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		apiPaths,
		DEFAULT_PATIENT_FLOW,
		PATIENT_FLOW_CHECKLIST_MAX_ITEMS,
		PATIENT_FLOW_NARRATIVE_MAX_LENGTH,
		type PatientFlow,
		type PatientFlowChecklistItem
	} from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass, labelClass, textareaClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const flowQuery = createQuery(() => ({
		queryKey: qs.keys.settings.patientFlow(),
		queryFn: () => apiGet<PatientFlow>(apiPaths.settingsPatientFlow),
		enabled: qs.ready
	}));

	let narrative = $state('');
	let checklist = $state<PatientFlowChecklistItem[]>([]);
	let isDefault = $state(true);
	let updatedBy = $state<string | null>(null);
	let hydrated = $state(false);
	let saving = $state(false);
	let savedOk = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		const data = flowQuery.data;
		if (!data || hydrated) return;
		narrative = data.narrative;
		checklist = data.checklist.map((item) => ({ ...item }));
		isDefault = data.is_default;
		updatedBy = data.updated_by;
		hydrated = true;
	});

	/** Yeni satır kimliği: kararlı, kısa, çakışmasız (`p23`, `p24`…). */
	function nextItemId(): string {
		const used = new Set(checklist.map((i) => i.id));
		for (let n = checklist.length + 1; ; n += 1) {
			const candidate = `p${String(n).padStart(2, '0')}`;
			if (!used.has(candidate)) return candidate;
		}
	}

	function addRow() {
		if (checklist.length >= PATIENT_FLOW_CHECKLIST_MAX_ITEMS) return;
		checklist = [
			...checklist,
			{ id: nextItemId(), stage: '', label: '', evidence: '', when: '', warning: '' }
		];
	}

	function removeRow(id: string) {
		checklist = checklist.filter((item) => item.id !== id);
	}

	/** Gömülü varsayılanı forma yükler; kalıcı olması için Kaydet gerekir. */
	function loadDefaults() {
		narrative = DEFAULT_PATIENT_FLOW.narrative;
		checklist = DEFAULT_PATIENT_FLOW.checklist.map((item) => ({ ...item }));
	}

	/** Alanı boş olan satır modele gürültü taşır; kaydetmeden önce engelle. */
	const invalidRows = $derived(
		checklist.filter((item) => !item.label.trim() || !item.warning.trim()).length
	);

	async function save() {
		if (saving || invalidRows > 0) return;
		saving = true;
		error = null;
		try {
			const saved = await apiSend<PatientFlow>(apiPaths.settingsPatientFlow, 'PUT', {
				narrative,
				checklist: checklist.map((item) => ({
					id: item.id,
					stage: item.stage.trim(),
					label: item.label.trim(),
					evidence: item.evidence.trim(),
					when: item.when.trim(),
					warning: item.warning.trim()
				}))
			});
			narrative = saved.narrative;
			checklist = saved.checklist.map((item) => ({ ...item }));
			isDefault = saved.is_default;
			updatedBy = saved.updated_by;
			await queryClient.invalidateQueries({ queryKey: qs.keys.settings.patientFlow() });
			savedOk = true;
			setTimeout(() => (savedOk = false), 2000);
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.patientFlow.error');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.patientFlow.title')} · {t('nav.settings')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title={t('settings.patientFlow.title')}
		description={t('settings.patientFlow.description')}
	/>

	<!-- Ekip alışkanlıkları: AI isabetini en çok artıran üç yazım kuralı, gözün önünde dursun (2026-09-16). -->
	<section class="rounded-lg border border-warning/40 bg-warning/10 p-4 sm:p-5">
		<h2 class="text-sm font-semibold text-text">{t('settings.patientFlow.habits.heading')}</h2>
		<p class="mt-1 text-xs text-text-faint">{t('settings.patientFlow.habits.why')}</p>
		<ol class="mt-3 list-decimal space-y-2 pl-5 text-sm text-text">
			<li>{t('settings.patientFlow.habits.rpt')}</li>
			<li>{t('settings.patientFlow.habits.finish')}</li>
			<li>{t('settings.patientFlow.habits.docs')}</li>
		</ol>
	</section>

	<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
		<h2 class="text-sm font-semibold text-text">{t('settings.patientFlow.narrative.heading')}</h2>
		<p class="mt-1 text-sm text-text-muted">{t('settings.patientFlow.narrative.why')}</p>

		<label class="mt-4 grid gap-1">
			<span class={labelClass}>
				{t('settings.patientFlow.narrative.label')}
				{#if isDefault}
					<span class="font-normal text-text-faint">({t('settings.patientFlow.default')})</span>
				{/if}
			</span>
			<textarea
				class="{textareaClass} min-h-64 font-mono text-sm"
				bind:value={narrative}
				maxlength={PATIENT_FLOW_NARRATIVE_MAX_LENGTH}
				placeholder={t('settings.patientFlow.narrative.placeholder')}
				disabled={flowQuery.isPending}></textarea>
			<span class="text-xs text-text-faint">
				{t('settings.patientFlow.charCount', {
					count: narrative.length,
					max: PATIENT_FLOW_NARRATIVE_MAX_LENGTH
				})}
			</span>
		</label>
	</section>

	<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
		<h2 class="text-sm font-semibold text-text">{t('settings.patientFlow.checklist.heading')}</h2>
		<p class="mt-1 text-sm text-text-muted">{t('settings.patientFlow.checklist.why')}</p>

		<!-- Tablo dar ekranda kendi kutusunda yatay kayar; sayfa gövdesi taşmaz. -->
		<div class="-mx-4 mt-4 overflow-x-auto sm:mx-0">
			<table class="w-full min-w-[54rem] border-collapse text-sm">
				<thead>
					<tr class="border-b border-border text-left text-xs text-text-muted">
						<th class="px-2 py-2 font-medium">{t('settings.patientFlow.col.stage')}</th>
						<th class="px-2 py-2 font-medium">{t('settings.patientFlow.col.label')}</th>
						<th class="px-2 py-2 font-medium">{t('settings.patientFlow.col.evidence')}</th>
						<th class="px-2 py-2 font-medium">{t('settings.patientFlow.col.when')}</th>
						<th class="px-2 py-2 font-medium">{t('settings.patientFlow.col.warning')}</th>
						<th class="px-2 py-2">
							<span class="sr-only">{t('settings.patientFlow.removeRow')}</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each checklist as item (item.id)}
						<tr class="border-b border-border/60 align-top">
							<td class="px-2 py-1.5">
								<input
									class="{fieldClass} min-w-[8rem]"
									bind:value={item.stage}
									maxlength={120}
									aria-label={t('settings.patientFlow.col.stage')}
								/>
							</td>
							<td class="px-2 py-1.5">
								<input
									class="{fieldClass} min-w-[10rem]"
									bind:value={item.label}
									maxlength={200}
									aria-label={t('settings.patientFlow.col.label')}
								/>
							</td>
							<td class="px-2 py-1.5">
								<input
									class="{fieldClass} min-w-[12rem]"
									bind:value={item.evidence}
									maxlength={300}
									aria-label={t('settings.patientFlow.col.evidence')}
								/>
							</td>
							<td class="px-2 py-1.5">
								<input
									class="{fieldClass} min-w-[9rem]"
									bind:value={item.when}
									maxlength={200}
									aria-label={t('settings.patientFlow.col.when')}
								/>
							</td>
							<td class="px-2 py-1.5">
								<input
									class="{fieldClass} min-w-[10rem]"
									bind:value={item.warning}
									maxlength={200}
									aria-label={t('settings.patientFlow.col.warning')}
								/>
							</td>
							<td class="px-2 py-1.5">
								<button
									type="button"
									class="inline-flex size-9 items-center justify-center rounded-[6px] text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
									onclick={() => removeRow(item.id)}
									aria-label={`${t('settings.patientFlow.removeRow')} — ${item.label || item.id}`}
									title={t('settings.patientFlow.removeRow')}
								>
									<Trash2 class="size-4" />
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if checklist.length === 0}
			<p class="mt-3 text-sm text-text-faint">{t('settings.patientFlow.checklist.empty')}</p>
		{/if}

		<div class="mt-3 flex flex-wrap items-center gap-2">
			<Button
				type="button"
				variant="outline"
				class="min-h-11"
				onclick={addRow}
				disabled={checklist.length >= PATIENT_FLOW_CHECKLIST_MAX_ITEMS}
			>
				<Plus class="size-4" />
				{t('settings.patientFlow.addRow')}
			</Button>
			<span class="text-xs text-text-faint">
				{t('settings.patientFlow.rowCount', {
					count: checklist.length,
					max: PATIENT_FLOW_CHECKLIST_MAX_ITEMS
				})}
			</span>
		</div>
	</section>

	<div class="mt-4 flex flex-wrap items-center gap-2">
		<Button
			type="button"
			class="min-h-11"
			onclick={save}
			disabled={saving || flowQuery.isPending || invalidRows > 0}
		>
			{saving ? t('settings.patientFlow.saving') : t('settings.patientFlow.save')}
		</Button>
		<Button
			type="button"
			variant="outline"
			class="min-h-11"
			onclick={loadDefaults}
			disabled={saving || flowQuery.isPending}
		>
			{t('settings.patientFlow.reset')}
		</Button>
		{#if savedOk}
			<span class="text-sm text-success">{t('settings.patientFlow.saved')}</span>
		{/if}
		{#if invalidRows > 0}
			<span class="text-sm text-danger">
				{t('settings.patientFlow.invalidRows', { count: invalidRows })}
			</span>
		{/if}
		{#if error}
			<span class="text-sm text-danger">{error}</span>
		{/if}
		{#if flowQuery.isError}
			<span class="text-sm text-danger">{t('settings.patientFlow.loadError')}</span>
		{/if}
	</div>

	<p class="mt-3 text-xs text-text-faint">
		{t('settings.patientFlow.footnote')}
		{#if updatedBy}
			· {t('settings.patientFlow.updatedBy', { name: updatedBy })}
		{/if}
	</p>
</div>

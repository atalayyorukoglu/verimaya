<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { IncentiveDeadlineSettings } from '@verimaya/shared';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass, labelClass } from '$lib/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import { useQueryScope } from '$lib/query-scope.svelte';

	const qs = useQueryScope();
	const queryClient = useQueryClient();

	const settingsQuery = createQuery(() => ({
		queryKey: qs.keys.settings.incentiveDeadline(),
		queryFn: () => apiGet<IncentiveDeadlineSettings>(apiPaths.settingsIncentiveDeadline),
		enabled: qs.ready
	}));

	let days = $state(180);
	let hydratedFor = $state<string | null>(null);
	let saving = $state(false);
	let resetting = $state(false);
	let error = $state<string | null>(null);
	let savedAt = $state<number | null>(null);

	$effect(() => {
		const data = settingsQuery.data;
		if (!data) return;
		const key = `${data.days}-${data.is_default}-${data.updated_at ?? ''}`;
		if (hydratedFor !== key) {
			days = data.days;
			hydratedFor = key;
		}
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = null;
		savedAt = null;
		try {
			const saved = await apiSend<IncentiveDeadlineSettings>(
				apiPaths.settingsIncentiveDeadline,
				'PUT',
				{ days }
			);
			queryClient.setQueryData(qs.keys.settings.incentiveDeadline(), saved);
			days = saved.days;
			hydratedFor = `${saved.days}-${saved.is_default}-${saved.updated_at ?? ''}`;
			savedAt = Date.now();
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.incentives.saveFailed');
		} finally {
			saving = false;
		}
	}

	async function reset() {
		resetting = true;
		error = null;
		savedAt = null;
		try {
			const saved = await apiSend<IncentiveDeadlineSettings>(
				apiPaths.settingsIncentiveDeadline,
				'DELETE'
			);
			queryClient.setQueryData(qs.keys.settings.incentiveDeadline(), saved);
			days = saved.days;
			hydratedFor = `${saved.days}-${saved.is_default}-${saved.updated_at ?? ''}`;
			savedAt = Date.now();
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.incentives.saveFailed');
		} finally {
			resetting = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.incentives.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title={t('settings.incentives.title')}
		description={t('settings.incentives.description')}
	/>

	{#if settingsQuery.isPending}
		<p class="text-sm text-text-muted">{t('finance.incentives.loading')}</p>
	{:else if settingsQuery.isError}
		<p class="text-sm text-danger">{t('settings.incentives.loadError')}</p>
	{:else if settingsQuery.data}
		<form class="flex max-w-sm flex-col gap-4" onsubmit={save}>
			<div>
				<label class={labelClass} for="incentive-days">{t('settings.incentives.days')}</label>
				<input
					id="incentive-days"
					type="number"
					min="1"
					max="3650"
					class={fieldClass}
					bind:value={days}
					required
				/>
				<p class="mt-1 text-xs text-text-muted">{t('settings.incentives.daysHint')}</p>
				{#if settingsQuery.data.is_default}
					<p class="mt-1 text-xs text-text-muted">{t('settings.incentives.isDefault')}</p>
				{/if}
			</div>

			{#if error}
				<p class="text-sm text-danger">{error}</p>
			{/if}
			{#if savedAt}
				<p class="text-sm text-text-muted">{t('settings.incentives.saved')}</p>
			{/if}

			<div class="flex flex-wrap gap-2">
				<Button type="submit" disabled={saving || resetting}>
					{saving ? t('settings.incentives.saving') : t('settings.incentives.save')}
				</Button>
				{#if !settingsQuery.data.is_default}
					<Button type="button" variant="outline" disabled={saving || resetting} onclick={reset}>
						{resetting ? t('settings.incentives.resetting') : t('settings.incentives.reset')}
					</Button>
				{/if}
			</div>
		</form>
	{/if}
</div>

<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		apiPaths,
		OPERATION_ALERT_KINDS,
		OPERATION_ALERT_THRESHOLD_HOURS_MAX,
		OPERATION_ALERT_THRESHOLD_HOURS_MIN,
		cloneOperationAlertThresholds,
		defaultOperationAlertThresholds,
		type OperationAlertKind,
		type OperationAlertSettings,
		type OperationAlertThresholds
	} from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	let draft = $state<OperationAlertThresholds>(defaultOperationAlertThresholds());
	let hydrated = $state(false);
	let saving = $state(false);
	let resetting = $state(false);
	let savedOk = $state(false);
	let error = $state<string | null>(null);

	const kindMessageKey: Record<OperationAlertKind, MessageKey> = {
		flight: 'appointments.alerts.kind.flight',
		transfer: 'appointments.alerts.kind.transfer',
		welcome: 'appointments.alerts.kind.welcome',
		clinic: 'appointments.alerts.kind.clinic'
	};

	const query = createQuery(() => ({
		queryKey: qs.keys.settings.operationAlerts(),
		queryFn: () => apiGet<OperationAlertSettings>(apiPaths.settingsOperationAlerts),
		enabled: qs.ready
	}));

	$effect(() => {
		const data = query.data;
		if (!data || hydrated) return;
		draft = cloneOperationAlertThresholds(data.thresholds);
		hydrated = true;
	});

	async function persist(thresholds: OperationAlertThresholds) {
		const saved = await apiSend<OperationAlertSettings>(apiPaths.settingsOperationAlerts, 'PUT', {
			thresholds
		});
		draft = cloneOperationAlertThresholds(saved.thresholds);
		savedOk = true;
		await queryClient.invalidateQueries({ queryKey: qs.keys.settings.operationAlerts() });
		await queryClient.invalidateQueries({ queryKey: qs.keys.operationAlerts.all() });
	}

	async function save() {
		saving = true;
		error = null;
		savedOk = false;
		try {
			await persist(cloneOperationAlertThresholds(draft));
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.operationAlerts.saveError');
		} finally {
			saving = false;
		}
	}

	async function reset() {
		if (!confirm(t('settings.operationAlerts.resetConfirm'))) return;
		resetting = true;
		error = null;
		savedOk = false;
		try {
			await persist(defaultOperationAlertThresholds());
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.operationAlerts.saveError');
		} finally {
			resetting = false;
		}
	}

	function toggleKind(kind: OperationAlertKind) {
		draft[kind].enabled = !draft[kind].enabled;
	}
</script>

<svelte:head>
	<title>{t('settings.operationAlerts.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title={t('settings.operationAlerts.title')}
		description={t('settings.operationAlerts.description')}
		helpTopic="operation-alert-settings"
	/>

	{#if query.isPending}
		<p class="text-sm text-text-muted">{t('common.loading')}</p>
	{:else if query.isError}
		<p class="text-sm text-danger">{t('settings.operationAlerts.loadError')}</p>
	{:else}
		{#if error}
			<p class="mb-3 text-sm text-danger" role="alert">{error}</p>
		{/if}
		{#if savedOk}
			<p class="mb-3 text-sm text-success" role="status">{t('settings.operationAlerts.saved')}</p>
			<p class="mb-3 text-sm text-text-muted" role="status">
				{t('settings.operationAlerts.afterSave')}
			</p>
		{/if}
		{#if query.data?.is_default}
			<p class="mb-3 text-xs text-text-muted">{t('settings.operationAlerts.isDefault')}</p>
		{/if}

		<div class="flex flex-col gap-3">
			{#each OPERATION_ALERT_KINDS as kind (kind)}
				<div
					class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:gap-4"
				>
					<p class="font-medium text-text sm:w-28">{t(kindMessageKey[kind])}</p>
					<button
						type="button"
						class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[6px] border border-border px-3 text-sm font-medium text-text hover:bg-surface-2"
						aria-pressed={draft[kind].enabled}
						onclick={() => toggleKind(kind)}
					>
						{draft[kind].enabled
							? t('settings.operationAlerts.enabled')
							: t('settings.operationAlerts.disabled')}
					</button>
					<div class="flex min-w-0 flex-wrap items-center gap-2 text-sm text-text">
						<span>{t('settings.operationAlerts.hoursBefore')}</span>
						<input
							id={`operation-alert-hours-${kind}`}
							type="number"
							min={OPERATION_ALERT_THRESHOLD_HOURS_MIN}
							max={OPERATION_ALERT_THRESHOLD_HOURS_MAX}
							step="1"
							class="{fieldClass} h-11 min-h-11 w-24 text-base"
							aria-label={t(kindMessageKey[kind])}
							disabled={!draft[kind].enabled}
							bind:value={draft[kind].hours}
						/>
						<span>{t('settings.operationAlerts.hoursSuffix')}</span>
					</div>
				</div>
			{/each}
		</div>

		<div class="mt-5 flex flex-wrap gap-2">
			<Button type="button" disabled={saving || resetting} onclick={() => void save()}>
				{saving ? t('common.saving') : t('common.save')}
			</Button>
			<Button
				type="button"
				variant="outline"
				disabled={saving || resetting}
				onclick={() => void reset()}
			>
				{resetting ? t('common.wait') : t('settings.operationAlerts.reset')}
			</Button>
		</div>
	{/if}
</div>

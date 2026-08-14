<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type {
		DataDeleteExecuteResult,
		DataDeletePreviewResult,
		DataDeleteScope
	} from '@verimaya/shared';
	import { apiPaths, apiSend, ApiRequestError } from '$lib/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import { meQueryOptions } from '$lib/me-query';

	const scopeOptions: DataDeleteScope[] = ['transactions', 'appointments', 'contacts', 'files'];
	const meQuery = createQuery(() => meQueryOptions());

	let scopes = $state<DataDeleteScope[]>([]);
	let preview = $state.raw<DataDeletePreviewResult | null>(null);
	let executeResult = $state.raw<DataDeleteExecuteResult | null>(null);
	let confirmName = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	const canPreview = $derived(scopes.length > 0 && !busy);
	const confirmMatches = $derived(
		preview !== null && confirmName.trim() === preview.organization_name.trim()
	);
	const canExecute = $derived(!!preview?.plan_token && confirmMatches && !busy);

	function scopeLabel(scope: DataDeleteScope): string {
		switch (scope) {
			case 'transactions':
				return t('settings.dataDelete.scope.transactions');
			case 'appointments':
				return t('settings.dataDelete.scope.appointments');
			case 'contacts':
				return t('settings.dataDelete.scope.contacts');
			case 'files':
				return t('settings.dataDelete.scope.files');
		}
	}

	function clearPreview(): void {
		preview = null;
		confirmName = '';
		error = null;
	}

	function errorMessage(value: unknown): string {
		if (value instanceof ApiRequestError) {
			switch (value.code) {
				case 'owner_required':
					return t('settings.dataDelete.errorOwner');
				case 'confirm_organization_name_mismatch':
					return t('settings.dataDelete.errorName');
				case 'invalid_plan_token':
				case 'plan_expired':
				case 'plan_already_used':
					return t('settings.dataDelete.errorToken');
				default:
					return value.message || t('settings.dataDelete.errorGeneric');
			}
		}

		return value instanceof Error ? value.message : t('settings.dataDelete.errorGeneric');
	}

	async function runPreview(): Promise<void> {
		if (!canPreview) return;

		busy = true;
		error = null;
		executeResult = null;
		confirmName = '';

		try {
			preview = await apiSend<DataDeletePreviewResult>(apiPaths.settingsDataDeletePreview, 'POST', {
				scopes: scopes.slice()
			});
		} catch (value) {
			preview = null;
			error = errorMessage(value);
		} finally {
			busy = false;
		}
	}

	async function runExecute(): Promise<void> {
		if (!preview?.plan_token || !confirmMatches || busy) return;

		busy = true;
		error = null;

		try {
			executeResult = await apiSend<DataDeleteExecuteResult>(
				apiPaths.settingsDataDeleteExecute,
				'POST',
				{
					plan_token: preview.plan_token,
					confirm_organization_name: confirmName.trim()
				}
			);
			preview = null;
			confirmName = '';
			scopes = [];
		} catch (value) {
			error = errorMessage(value);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.dataDelete.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-2xl min-w-0">
	<SettingsBackLink />
	<PageHeader title={t('settings.dataDelete.title')} />

	{#if meQuery.isPending}
		<p class="text-sm text-text-muted">{t('settings.organization.loading')}</p>
	{:else if meQuery.data?.role !== 'owner'}
		<div class="min-w-0 rounded-lg border border-danger/40 bg-danger/5 p-4 sm:p-5">
			<p class="text-sm leading-relaxed text-danger" role="alert">
				{t('settings.dataDelete.ownerOnly')}
			</p>
		</div>
	{:else}
		<section class="min-w-0 rounded-lg border border-danger/40 bg-danger/5 p-4 sm:p-6">
			<p class="text-sm leading-relaxed text-danger" role="alert">
				{t('settings.dataDelete.warning')}
			</p>

			<div class="mt-6 min-w-0">
				<h2 class="text-base font-semibold text-text">
					{t('settings.dataDelete.scopesHeading')}
				</h2>
				<p id="data-delete-scopes-hint" class="mt-1 text-sm leading-relaxed text-text-muted">
					{t('settings.dataDelete.scopesHint')}
				</p>

				<div class="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
					{#each scopeOptions as scope (scope)}
						<label
							class="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-md border border-danger/30 bg-surface px-3 py-2 text-sm text-text"
						>
							<input
								type="checkbox"
								value={scope}
								bind:group={scopes}
								disabled={busy}
								aria-describedby="data-delete-scopes-hint"
								class="size-5 shrink-0 accent-danger"
								onchange={clearPreview}
							/>
							<span class="min-w-0 break-words">{scopeLabel(scope)}</span>
						</label>
					{/each}
				</div>

				<Button
					variant="outline"
					class="mt-4 h-11 min-h-11 w-full border-danger/40 px-4 text-base text-danger sm:w-auto"
					disabled={!canPreview}
					onclick={runPreview}
				>
					{t('settings.dataDelete.preview')}
				</Button>
			</div>

			{#if error}
				<p class="mt-4 text-sm text-danger" role="alert">{error}</p>
			{/if}

			{#if executeResult}
				<p class="mt-4 text-sm font-medium text-text" role="status">
					{t('settings.dataDelete.executeDone', {
						n: String(executeResult.total_deleted)
					})}
				</p>
			{/if}

			{#if preview}
				<div class="mt-6 min-w-0 border-t border-danger/30 pt-5">
					<h2 class="text-base font-semibold text-text">
						{t('settings.dataDelete.previewResult')}
					</h2>

					<div class="mt-3 min-w-0 overflow-hidden rounded-md border border-danger/30 bg-surface">
						<table class="w-full table-fixed text-left text-sm">
							<thead class="border-b border-border bg-surface-2 text-text-muted">
								<tr>
									<th class="w-2/3 px-3 py-2 font-medium">
										{t('settings.dataDelete.table')}
									</th>
									<th class="w-1/3 px-3 py-2 text-right font-medium">
										{t('settings.dataDelete.count')}
									</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-border">
								{#each preview.counts as row (row.table)}
									<tr>
										<td class="min-w-0 px-3 py-2 break-all text-text">{row.table}</td>
										<td class="px-3 py-2 text-right text-text">{row.count}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<p class="mt-3 text-sm font-medium text-text">
						{t('settings.dataDelete.total', { n: String(preview.total_rows) })}
					</p>
					<p class="mt-1 text-xs leading-relaxed text-text-muted">
						{t('settings.dataDelete.expires', {
							at: new Date(preview.expires_at).toLocaleString()
						})}
					</p>

					<form
						class="mt-5 min-w-0"
						onsubmit={(event) => {
							event.preventDefault();
							void runExecute();
						}}
					>
						<label class="block text-sm font-medium text-text" for="data-delete-confirm-name">
							{t('settings.dataDelete.confirmLabel', {
								name: preview.organization_name
							})}
						</label>
						<input
							id="data-delete-confirm-name"
							type="text"
							autocomplete="off"
							bind:value={confirmName}
							placeholder={t('settings.dataDelete.confirmPlaceholder')}
							disabled={busy}
							class="mt-2 box-border h-11 w-full max-w-full min-w-0 rounded-[6px] border border-danger/40 bg-surface px-3 text-base text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-danger/40"
						/>

						<Button
							type="submit"
							variant="destructive"
							class="mt-4 h-11 min-h-11 w-full px-4 text-base sm:w-auto"
							disabled={!canExecute}
						>
							{t('settings.dataDelete.execute')}
						</Button>
					</form>
				</div>
			{/if}
		</section>
	{/if}
</div>

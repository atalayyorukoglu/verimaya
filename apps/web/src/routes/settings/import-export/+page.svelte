<script lang="ts">
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { apiDownload, apiPaths, apiSend, apiUpload } from '$lib/api';
	import type {
		ImportBundleCommitResult,
		ImportBundleDryRunResult,
		ImportCommitResult,
		ImportDryRunResult
	} from '@verimaya/shared';

	let fileInput = $state<HTMLInputElement | null>(null);
	let selectedFile = $state<File | null>(null);
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let dryRun = $state<ImportDryRunResult | null>(null);
	let commitResult = $state<ImportCommitResult | null>(null);

	const canCommit = $derived(!!dryRun?.plan_token && dryRun.summary.error === 0 && !busy);

	let bundleFileInput = $state<HTMLInputElement | null>(null);
	let bundleSelectedFile = $state<File | null>(null);
	let bundleBusy = $state(false);
	let bundleErrorMsg = $state<string | null>(null);
	let bundleDryRun = $state<ImportBundleDryRunResult | null>(null);
	let bundleCommitResult = $state<ImportBundleCommitResult | null>(null);

	const canCommitBundle = $derived(
		!!bundleDryRun?.plan_token && bundleDryRun.summary.error === 0 && !bundleBusy
	);

	function onFileChange(ev: Event) {
		const input = ev.currentTarget as HTMLInputElement;
		selectedFile = input.files?.[0] ?? null;
		dryRun = null;
		commitResult = null;
		errorMsg = null;
	}

	async function downloadTemplate() {
		busy = true;
		errorMsg = null;
		try {
			await apiDownload(apiPaths.settingsImportContactsTemplate, 'contacts-template.xlsx');
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : t('settings.importExport.errorGeneric');
		} finally {
			busy = false;
		}
	}

	async function downloadExport() {
		busy = true;
		errorMsg = null;
		try {
			await apiDownload(apiPaths.settingsImportContactsExport, 'contacts-export.xlsx');
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : t('settings.importExport.errorGeneric');
		} finally {
			busy = false;
		}
	}

	async function runDryRun() {
		if (!selectedFile) return;
		busy = true;
		errorMsg = null;
		commitResult = null;
		try {
			const fd = new FormData();
			fd.append('file', selectedFile);
			dryRun = await apiUpload<ImportDryRunResult>(apiPaths.settingsImportContactsDryRun, fd);
		} catch (e) {
			dryRun = null;
			errorMsg = e instanceof Error ? e.message : t('settings.importExport.errorGeneric');
		} finally {
			busy = false;
		}
	}

	async function runCommit() {
		if (!dryRun?.plan_token) return;
		busy = true;
		errorMsg = null;
		try {
			commitResult = await apiSend<ImportCommitResult>(
				apiPaths.settingsImportContactsCommit,
				'POST',
				{ plan_token: dryRun.plan_token }
			);
			dryRun = null;
			selectedFile = null;
			if (fileInput) fileInput.value = '';
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : t('settings.importExport.errorGeneric');
		} finally {
			busy = false;
		}
	}

	function actionLabel(action: string): string {
		switch (action) {
			case 'create':
				return t('settings.importExport.action.create');
			case 'update':
				return t('settings.importExport.action.update');
			case 'unchanged':
				return t('settings.importExport.action.unchanged');
			case 'error':
				return t('settings.importExport.action.error');
			default:
				return action;
		}
	}

	function sheetLabel(sheet: string): string {
		switch (sheet) {
			case 'cases':
				return t('settings.importExport.bundle.sheet.cases');
			case 'appointments':
				return t('settings.importExport.bundle.sheet.appointments');
			case 'transactions':
				return t('settings.importExport.bundle.sheet.transactions');
			default:
				return sheet;
		}
	}

	function onBundleFileChange(ev: Event) {
		const input = ev.currentTarget as HTMLInputElement;
		bundleSelectedFile = input.files?.[0] ?? null;
		bundleDryRun = null;
		bundleCommitResult = null;
		bundleErrorMsg = null;
	}

	async function downloadBundleTemplate() {
		bundleBusy = true;
		bundleErrorMsg = null;
		try {
			await apiDownload(apiPaths.settingsImportBundleTemplate, 'bundle-template.xlsx');
		} catch (e) {
			bundleErrorMsg = e instanceof Error ? e.message : t('settings.importExport.errorGeneric');
		} finally {
			bundleBusy = false;
		}
	}

	async function downloadBundleExport() {
		bundleBusy = true;
		bundleErrorMsg = null;
		try {
			await apiDownload(apiPaths.settingsImportBundleExport, 'bundle-export.xlsx');
		} catch (e) {
			bundleErrorMsg = e instanceof Error ? e.message : t('settings.importExport.errorGeneric');
		} finally {
			bundleBusy = false;
		}
	}

	async function runBundleDryRun() {
		if (!bundleSelectedFile) return;
		bundleBusy = true;
		bundleErrorMsg = null;
		bundleCommitResult = null;
		try {
			const fd = new FormData();
			fd.append('file', bundleSelectedFile);
			bundleDryRun = await apiUpload<ImportBundleDryRunResult>(
				apiPaths.settingsImportBundleDryRun,
				fd
			);
		} catch (e) {
			bundleDryRun = null;
			bundleErrorMsg = e instanceof Error ? e.message : t('settings.importExport.errorGeneric');
		} finally {
			bundleBusy = false;
		}
	}

	async function runBundleCommit() {
		if (!bundleDryRun?.plan_token) return;
		bundleBusy = true;
		bundleErrorMsg = null;
		try {
			bundleCommitResult = await apiSend<ImportBundleCommitResult>(
				apiPaths.settingsImportBundleCommit,
				'POST',
				{ plan_token: bundleDryRun.plan_token }
			);
			bundleDryRun = null;
			bundleSelectedFile = null;
			if (bundleFileInput) bundleFileInput.value = '';
		} catch (e) {
			bundleErrorMsg = e instanceof Error ? e.message : t('settings.importExport.errorGeneric');
		} finally {
			bundleBusy = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.importExport.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title={t('settings.importExport.title')}
		description={t('settings.importExport.description')}
	/>

	<section class="rounded-lg border border-border bg-surface p-4 sm:p-6">
		<h2 class="text-base font-semibold text-text">{t('settings.importExport.contacts.title')}</h2>
		<p class="mt-1 text-sm leading-relaxed text-text-muted">
			{t('settings.importExport.contacts.blurb')}
		</p>

		<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
			<button
				type="button"
				class="inline-flex h-11 min-h-11 items-center justify-center rounded-[6px] border border-border bg-surface-2 px-4 text-base font-medium text-text hover:bg-border disabled:opacity-50 sm:h-9 sm:min-h-9 sm:text-sm"
				disabled={busy}
				onclick={downloadTemplate}
			>
				{t('settings.importExport.downloadTemplate')}
			</button>
			<button
				type="button"
				class="inline-flex h-11 min-h-11 items-center justify-center rounded-[6px] border border-border bg-surface-2 px-4 text-base font-medium text-text hover:bg-border disabled:opacity-50 sm:h-9 sm:min-h-9 sm:text-sm"
				disabled={busy}
				onclick={downloadExport}
			>
				{t('settings.importExport.downloadExport')}
			</button>
		</div>

		<div class="mt-5">
			<label class="mb-1 block text-xs font-medium text-text-muted" for="import-contacts-file">
				{t('settings.importExport.chooseFile')}
			</label>
			<input
				id="import-contacts-file"
				bind:this={fileInput}
				type="file"
				accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
				class="box-border block h-11 w-full max-w-full min-w-0 rounded-[6px] border border-border bg-surface px-3 text-base text-text file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm sm:h-9 sm:text-sm"
				onchange={onFileChange}
			/>
			{#if selectedFile}
				<p class="mt-1 truncate text-xs text-text-muted">{selectedFile.name}</p>
			{/if}
		</div>

		<div class="mt-4 flex flex-col gap-3 sm:flex-row">
			<button
				type="button"
				class="inline-flex h-11 min-h-11 items-center justify-center rounded-[6px] bg-brand px-4 text-base font-medium text-white hover:opacity-90 disabled:opacity-50 sm:h-9 sm:min-h-9 sm:text-sm"
				disabled={busy || !selectedFile}
				onclick={runDryRun}
			>
				{t('settings.importExport.dryRun')}
			</button>
			<button
				type="button"
				class="inline-flex h-11 min-h-11 items-center justify-center rounded-[6px] border border-border bg-surface-2 px-4 text-base font-medium text-text hover:bg-border disabled:opacity-50 sm:h-9 sm:min-h-9 sm:text-sm"
				disabled={!canCommit}
				onclick={runCommit}
			>
				{t('settings.importExport.commit')}
			</button>
		</div>

		{#if errorMsg}
			<p class="mt-4 text-sm text-danger" role="alert">{errorMsg}</p>
		{/if}

		{#if commitResult}
			<p class="mt-4 text-sm text-text">
				{t('settings.importExport.commitDone', {
					created: String(commitResult.created),
					updated: String(commitResult.updated),
					unchanged: String(commitResult.unchanged)
				})}
			</p>
		{/if}

		{#if dryRun}
			<div class="mt-5 overflow-x-auto rounded-md border border-border">
				<p class="border-b border-border bg-surface-2 px-3 py-2 text-sm text-text">
					{t('settings.importExport.summary', {
						total: String(dryRun.summary.total_rows),
						create: String(dryRun.summary.create),
						update: String(dryRun.summary.update),
						unchanged: String(dryRun.summary.unchanged),
						error: String(dryRun.summary.error)
					})}
				</p>
				{#if dryRun.summary.error > 0}
					<p class="px-3 py-2 text-sm text-danger">
						{t('settings.importExport.errorsBlockCommit')}
					</p>
				{/if}
				<table class="w-full min-w-[28rem] text-left text-sm">
					<thead>
						<tr class="border-b border-border text-text-muted">
							<th class="px-3 py-2 font-medium">{t('settings.importExport.col.row')}</th>
							<th class="px-3 py-2 font-medium">{t('settings.importExport.col.action')}</th>
							<th class="px-3 py-2 font-medium">{t('settings.importExport.col.label')}</th>
							<th class="px-3 py-2 font-medium">{t('settings.importExport.col.errors')}</th>
						</tr>
					</thead>
					<tbody>
						{#each dryRun.rows as row (row.row_number)}
							<tr class="border-b border-border/60 align-top">
								<td class="px-3 py-2 text-text-muted">{row.row_number}</td>
								<td class="px-3 py-2 text-text">{actionLabel(row.action)}</td>
								<td class="px-3 py-2 text-text">{row.label ?? '—'}</td>
								<td class="px-3 py-2 text-danger">
									{row.errors.length ? row.errors.join('; ') : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="mt-6 rounded-lg border border-border bg-surface p-4 sm:p-6">
		<h2 class="text-base font-semibold text-text">{t('settings.importExport.bundle.title')}</h2>
		<p class="mt-1 text-sm leading-relaxed text-text-muted">
			{t('settings.importExport.bundle.blurb')}
		</p>

		<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
			<button
				type="button"
				class="inline-flex h-11 min-h-11 items-center justify-center rounded-[6px] border border-border bg-surface-2 px-4 text-base font-medium text-text hover:bg-border disabled:opacity-50 sm:h-9 sm:min-h-9 sm:text-sm"
				disabled={bundleBusy}
				onclick={downloadBundleTemplate}
			>
				{t('settings.importExport.downloadTemplate')}
			</button>
			<button
				type="button"
				class="inline-flex h-11 min-h-11 items-center justify-center rounded-[6px] border border-border bg-surface-2 px-4 text-base font-medium text-text hover:bg-border disabled:opacity-50 sm:h-9 sm:min-h-9 sm:text-sm"
				disabled={bundleBusy}
				onclick={downloadBundleExport}
			>
				{t('settings.importExport.downloadExport')}
			</button>
		</div>

		<div class="mt-5">
			<label class="mb-1 block text-xs font-medium text-text-muted" for="import-bundle-file">
				{t('settings.importExport.chooseFile')}
			</label>
			<input
				id="import-bundle-file"
				bind:this={bundleFileInput}
				type="file"
				accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
				class="box-border block h-11 w-full max-w-full min-w-0 rounded-[6px] border border-border bg-surface px-3 text-base text-text file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm sm:h-9 sm:text-sm"
				onchange={onBundleFileChange}
			/>
			{#if bundleSelectedFile}
				<p class="mt-1 truncate text-xs text-text-muted">{bundleSelectedFile.name}</p>
			{/if}
		</div>

		<div class="mt-4 flex flex-col gap-3 sm:flex-row">
			<button
				type="button"
				class="inline-flex h-11 min-h-11 items-center justify-center rounded-[6px] bg-brand px-4 text-base font-medium text-white hover:opacity-90 disabled:opacity-50 sm:h-9 sm:min-h-9 sm:text-sm"
				disabled={bundleBusy || !bundleSelectedFile}
				onclick={runBundleDryRun}
			>
				{t('settings.importExport.dryRun')}
			</button>
			<button
				type="button"
				class="inline-flex h-11 min-h-11 items-center justify-center rounded-[6px] border border-border bg-surface-2 px-4 text-base font-medium text-text hover:bg-border disabled:opacity-50 sm:h-9 sm:min-h-9 sm:text-sm"
				disabled={!canCommitBundle}
				onclick={runBundleCommit}
			>
				{t('settings.importExport.commit')}
			</button>
		</div>

		{#if bundleErrorMsg}
			<p class="mt-4 text-sm text-danger" role="alert">{bundleErrorMsg}</p>
		{/if}

		{#if bundleCommitResult}
			<p class="mt-4 text-sm text-text">
				{t('settings.importExport.bundle.commitDone', {
					casesCreated: String(bundleCommitResult.cases.created),
					casesUpdated: String(bundleCommitResult.cases.updated),
					appointmentsCreated: String(bundleCommitResult.appointments.created),
					appointmentsUpdated: String(bundleCommitResult.appointments.updated),
					transactionsCreated: String(bundleCommitResult.transactions.created),
					transactionsUpdated: String(bundleCommitResult.transactions.updated)
				})}
			</p>
		{/if}

		{#if bundleDryRun}
			<div class="mt-5 overflow-x-auto rounded-md border border-border">
				<p class="border-b border-border bg-surface-2 px-3 py-2 text-sm text-text">
					{t('settings.importExport.bundle.summary', {
						total: String(bundleDryRun.summary.total_rows),
						create: String(bundleDryRun.summary.create),
						update: String(bundleDryRun.summary.update),
						unchanged: String(bundleDryRun.summary.unchanged),
						error: String(bundleDryRun.summary.error)
					})}
				</p>
				{#if bundleDryRun.summary.error > 0}
					<p class="px-3 py-2 text-sm text-danger">
						{t('settings.importExport.errorsBlockCommit')}
					</p>
				{/if}
				<table class="w-full min-w-[32rem] text-left text-sm">
					<thead>
						<tr class="border-b border-border text-text-muted">
							<th class="px-3 py-2 font-medium">{t('settings.importExport.col.row')}</th>
							<th class="px-3 py-2 font-medium">{t('settings.importExport.bundle.col.sheet')}</th>
							<th class="px-3 py-2 font-medium">{t('settings.importExport.col.action')}</th>
							<th class="px-3 py-2 font-medium">{t('settings.importExport.col.label')}</th>
							<th class="px-3 py-2 font-medium">{t('settings.importExport.col.errors')}</th>
						</tr>
					</thead>
					<tbody>
						{#each bundleDryRun.rows as row (`${row.sheet}-${row.row_number}`)}
							<tr class="border-b border-border/60 align-top">
								<td class="px-3 py-2 text-text-muted">{row.row_number}</td>
								<td class="px-3 py-2 text-text">{sheetLabel(row.sheet)}</td>
								<td class="px-3 py-2 text-text">{actionLabel(row.action)}</td>
								<td class="px-3 py-2 text-text">{row.label ?? '—'}</td>
								<td class="px-3 py-2 text-danger">
									{row.errors.length ? row.errors.join('; ') : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<p class="mt-4 text-xs leading-relaxed text-text-muted">
		{t('settings.importExport.footnote')}
	</p>
</div>

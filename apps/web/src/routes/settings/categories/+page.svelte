<script lang="ts">
	import { resolve } from '$app/paths';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { FinanceCategory, FinanceCategoryCreate } from '@verimaya/shared';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass, labelClass } from '$lib/api';
	import { moveCategoryWithinKind, toCategoryReorderItems } from '$lib/category-order';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	type CategoriesData = { items: FinanceCategory[] };

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const catsQuery = createQuery(() => ({
		queryKey: qs.keys.settings.financeCategories(),
		queryFn: () => apiGet<CategoriesData>(apiPaths.settingsFinanceCategories),
		enabled: qs.ready
	}));

	const incomeItems = $derived(
		(catsQuery.data?.items ?? [])
			.filter((category) => category.kind === 'income')
			.toSorted((a, b) => a.sort_order - b.sort_order)
	);
	const expenseItems = $derived(
		(catsQuery.data?.items ?? [])
			.filter((category) => category.kind === 'expense')
			.toSorted((a, b) => a.sort_order - b.sort_order)
	);

	let dialogOpen = $state(false);
	let editing = $state<FinanceCategory | null>(null);
	let formKind = $state<'income' | 'expense'>('expense');
	let formName = $state('');
	let saving = $state(false);
	let formError = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let reordering = $state(false);
	let deleteOpen = $state(false);
	let deleteTarget = $state<FinanceCategory | null>(null);
	let deleting = $state(false);

	function openCreate() {
		editing = null;
		formKind = 'expense';
		formName = '';
		formError = null;
		dialogOpen = true;
	}

	function openEdit(cat: FinanceCategory) {
		editing = cat;
		formKind = cat.kind;
		formName = cat.name;
		formError = null;
		dialogOpen = true;
	}

	function openDelete(cat: FinanceCategory) {
		deleteTarget = cat;
		deleteOpen = true;
	}

	async function save(e: Event) {
		e.preventDefault();
		const name = formName.trim();
		if (!name) return;
		saving = true;
		formError = null;
		try {
			if (editing) {
				await apiSend(apiPaths.settingsFinanceCategory(editing.id), 'PATCH', {
					kind: formKind,
					name
				});
			} else {
				const payload: FinanceCategoryCreate = { kind: formKind, name };
				await apiSend(apiPaths.settingsFinanceCategories, 'POST', payload);
			}
			await queryClient.invalidateQueries({ queryKey: qs.keys.settings.financeCategories() });
			dialogOpen = false;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('common.saveFailed');
		} finally {
			saving = false;
		}
	}

	async function reorder(categoryId: string, direction: -1 | 1) {
		if (reordering) return;
		const queryKey = qs.keys.settings.financeCategories();
		const snapshot = queryClient.getQueryData<CategoriesData>(queryKey);
		if (!snapshot) return;
		const nextItems = moveCategoryWithinKind(snapshot.items, categoryId, direction);
		if (!nextItems) return;

		reordering = true;
		actionError = null;
		queryClient.setQueryData<CategoriesData>(queryKey, { ...snapshot, items: nextItems });
		try {
			await apiSend(apiPaths.settingsFinanceCategoriesReorder, 'PUT', {
				items: toCategoryReorderItems(nextItems)
			});
		} catch {
			queryClient.setQueryData(queryKey, snapshot);
			actionError = t('settings.categories.reorderError');
		} finally {
			reordering = false;
		}
	}

	async function remove() {
		if (!deleteTarget || deleting) return;
		deleting = true;
		actionError = null;
		try {
			await apiSend(apiPaths.settingsFinanceCategory(deleteTarget.id), 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.settings.financeCategories() });
			deleteOpen = false;
			deleteTarget = null;
		} catch {
			deleteOpen = false;
			actionError = t('settings.categories.deleteError');
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.categories.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink label={t('settings.categories.settingsBack')} />
	<PageHeader
		title={t('settings.categories.title')}
		description={t('settings.categories.description')}
	>
		{#snippet actions()}
			<Button class="min-h-11" type="button" size="sm" onclick={openCreate}>
				<Plus class="size-3.5" />
				{t('settings.categories.new')}
			</Button>
		{/snippet}
	</PageHeader>

	{#if actionError}
		<p class="mb-4 text-sm text-danger">{actionError}</p>
	{/if}

	{#if catsQuery.isPending}
		<p class="text-sm text-text-muted">{t('settings.categories.loading')}</p>
	{:else if catsQuery.isError}
		<p class="text-sm text-danger">{t('settings.categories.loadError')}</p>
	{:else if incomeItems.length + expenseItems.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">{t('settings.categories.empty')}</p>
			<Button class="mt-4 min-h-11" type="button" onclick={openCreate}
				>{t('settings.categories.emptyCta')}</Button
			>
		</div>
	{:else}
		<div class="grid min-w-0 gap-6">
			{#each [{ title: t('settings.categories.incomeSection'), rows: incomeItems }, { title: t('settings.categories.expenseSection'), rows: expenseItems }] as section (section.title)}
				<section class="min-w-0">
					<h2 class="mb-2 text-sm font-semibold text-text">{section.title}</h2>
					{#if section.rows.length === 0}
						<p class="rounded-lg border border-dashed border-border p-4 text-sm text-text-muted">
							{t('settings.categories.empty')}
						</p>
					{:else}
						<ul class="min-w-0 space-y-2">
							{#each section.rows as cat, index (cat.id)}
								<li
									class="flex min-w-0 items-center gap-1 rounded-lg border border-border bg-surface p-2 sm:gap-2"
								>
									<a
										href={resolve('/settings/categories/[id]', { id: cat.id })}
										class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[6px] px-2 py-1 hover:bg-surface-2"
										aria-label={t('settings.categories.openAria', { name: cat.name })}
									>
										<div class="min-w-0 flex-1">
											<p class="truncate font-medium text-text">{cat.name}</p>
											<p class="text-xs text-text-muted">
												{cat.subcategories.length > 0
													? t('settings.categories.subcategoryCount', {
															count: cat.subcategories.length
														})
													: t('settings.categories.noSubcategories')}
											</p>
										</div>
										<ChevronRight class="size-4 shrink-0 text-text-faint" />
									</a>
									<div class="flex shrink-0 items-center">
										<button
											type="button"
											class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[6px] text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
											aria-label={t('settings.categories.moveUpAria', { name: cat.name })}
											disabled={reordering || index === 0}
											onclick={() => void reorder(cat.id, -1)}
										>
											<ArrowUp class="size-4" />
										</button>
										<button
											type="button"
											class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[6px] text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
											aria-label={t('settings.categories.moveDownAria', { name: cat.name })}
											disabled={reordering || index === section.rows.length - 1}
											onclick={() => void reorder(cat.id, 1)}
										>
											<ArrowDown class="size-4" />
										</button>
										<button
											type="button"
											class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[6px] text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
											aria-label={t('settings.categories.editAria', { name: cat.name })}
											disabled={reordering}
											onclick={() => openEdit(cat)}
										>
											<Pencil class="size-4" />
										</button>
										<button
											type="button"
											class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[6px] text-text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-40"
											aria-label={t('settings.categories.deleteAria', { name: cat.name })}
											disabled={reordering}
											onclick={() => openDelete(cat)}
										>
											<Trash2 class="size-4" />
										</button>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</div>

<Dialog
	bind:open={dialogOpen}
	title={editing ? t('settings.categories.editTitle') : t('settings.categories.createTitle')}
>
	<form class="grid gap-3" onsubmit={save}>
		{#if formError}
			<p class="text-sm text-danger">{formError}</p>
		{/if}
		<label class="grid gap-1">
			<span class={labelClass}>{t('settings.categories.kind')}</span>
			<select class={`${fieldClass} min-h-11`} bind:value={formKind}>
				<option value="income">{t('settings.categories.income')}</option>
				<option value="expense">{t('settings.categories.expense')}</option>
			</select>
		</label>
		<label class="grid gap-1">
			<span class={labelClass}>{t('settings.categories.name')}</span>
			<input class={`${fieldClass} min-h-11`} bind:value={formName} required maxlength="128" />
		</label>
		<div class="mt-2 flex min-w-0 flex-wrap justify-end gap-2">
			<Button
				class="min-h-11"
				type="button"
				variant="outline"
				disabled={saving}
				onclick={() => (dialogOpen = false)}
			>
				{t('common.cancel')}
			</Button>
			<Button class="min-h-11" type="submit" disabled={saving || !formName.trim()}
				>{saving ? t('common.saving') : t('common.save')}</Button
			>
		</div>
	</form>
</Dialog>

<Dialog
	bind:open={deleteOpen}
	title={t('settings.categories.deleteTitle')}
	description={deleteTarget
		? t('settings.categories.deleteDescription', { name: deleteTarget.name })
		: undefined}
>
	<div class="flex min-w-0 flex-wrap justify-end gap-2">
		<Button
			class="min-h-11"
			type="button"
			variant="outline"
			disabled={deleting}
			onclick={() => (deleteOpen = false)}
		>
			{t('common.cancel')}
		</Button>
		<Button
			class="min-h-11"
			type="button"
			variant="destructive"
			disabled={deleting}
			onclick={() => void remove()}
		>
			{deleting ? t('common.saving') : t('settings.categories.deleteConfirm')}
		</Button>
	</div>
</Dialog>

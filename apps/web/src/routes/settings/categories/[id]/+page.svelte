<script lang="ts">
	import { page } from '$app/state';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { FinanceCategory } from '@verimaya/shared';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass, labelClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	type CategoriesData = { items: FinanceCategory[] };

	const queryClient = useQueryClient();
	const qs = useQueryScope();
	const categoryId = $derived(page.params.id);
	const queryKey = $derived(qs.keys.settings.financeCategories());

	const catsQuery = createQuery(() => ({
		queryKey,
		queryFn: () => apiGet<CategoriesData>(apiPaths.settingsFinanceCategories),
		enabled: qs.ready
	}));

	const category = $derived(
		(catsQuery.data?.items ?? []).find((item) => item.id === categoryId) ?? null
	);

	let editOpen = $state(false);
	let editIndex = $state<number | null>(null);
	let formName = $state('');
	let deleteOpen = $state(false);
	let deleteIndex = $state<number | null>(null);
	let deleteName = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	function openCreate() {
		editIndex = null;
		formName = '';
		error = null;
		editOpen = true;
	}

	function openEdit(index: number, name: string) {
		editIndex = index;
		formName = name;
		error = null;
		editOpen = true;
	}

	function openDelete(index: number, name: string) {
		deleteIndex = index;
		deleteName = name;
		deleteOpen = true;
	}

	async function saveSubcategories(nextSubcategories: string[], errorKey: 'save' | 'delete') {
		if (!category || busy) return false;
		const snapshot = queryClient.getQueryData<CategoriesData>(queryKey);
		if (!snapshot) return false;

		const nextData: CategoriesData = {
			...snapshot,
			items: snapshot.items.map((item) =>
				item.id === category.id ? { ...item, subcategories: nextSubcategories } : item
			)
		};

		busy = true;
		error = null;
		queryClient.setQueryData(queryKey, nextData);
		try {
			await apiSend(apiPaths.settingsFinanceCategory(category.id), 'PATCH', {
				subcategories: nextSubcategories
			});
			return true;
		} catch {
			queryClient.setQueryData(queryKey, snapshot);
			error =
				errorKey === 'delete'
					? t('settings.categories.subcategoryDeleteError')
					: t('settings.categories.subcategorySaveError');
			return false;
		} finally {
			busy = false;
		}
	}

	async function submitSubcategory(event: Event) {
		event.preventDefault();
		if (!category || busy) return;
		const name = formName.trim();
		if (!name) return;

		const next = [...category.subcategories];
		if (editIndex === null) {
			next.push(name);
		} else {
			next[editIndex] = name;
		}

		if (await saveSubcategories(next, 'save')) {
			editOpen = false;
			editIndex = null;
			formName = '';
		}
	}

	async function removeSubcategory() {
		if (!category || deleteIndex === null || busy) return;
		const next = category.subcategories.filter((_, index) => index !== deleteIndex);
		if (await saveSubcategories(next, 'delete')) {
			deleteOpen = false;
			deleteIndex = null;
			deleteName = '';
		}
	}

	async function moveSubcategory(index: number, direction: -1 | 1) {
		if (!category || busy) return;
		const targetIndex = index + direction;
		if (targetIndex < 0 || targetIndex >= category.subcategories.length) return;
		const next = [...category.subcategories];
		[next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
		await saveSubcategories(next, 'save');
	}
</script>

<svelte:head>
	<title>
		{t('settings.categories.detailDocumentTitle', {
			name: category?.name ?? t('settings.categories.title')
		})}
	</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink href="/settings/categories" label={t('settings.categories.detailBack')} />

	{#if catsQuery.isPending}
		<p class="text-sm text-text-muted">{t('settings.categories.detailLoading')}</p>
	{:else if catsQuery.isError}
		<p class="text-sm text-danger">{t('settings.categories.detailLoadError')}</p>
	{:else if !category}
		<p class="text-sm text-danger">{t('settings.categories.notFound')}</p>
	{:else}
		<PageHeader
			title={category.name}
			description={category.kind === 'income'
				? t('settings.categories.income')
				: t('settings.categories.expense')}
		>
			{#snippet actions()}
				<Button class="min-h-11" type="button" size="sm" disabled={busy} onclick={openCreate}>
					<Plus class="size-4" />
					{t('settings.categories.addSubcategory')}
				</Button>
			{/snippet}
		</PageHeader>

		{#if error}
			<p class="mb-4 text-sm text-danger">{error}</p>
		{/if}

		<section class="min-w-0">
			<h2 class="mb-2 text-sm font-semibold text-text">
				{t('settings.categories.subcategoriesTitle', {
					count: category.subcategories.length
				})}
			</h2>
			{#if category.subcategories.length === 0}
				<p class="rounded-lg border border-dashed border-border p-5 text-sm text-text-muted">
					{t('settings.categories.noSubcategories')}
				</p>
			{:else}
				<ul class="min-w-0 space-y-2">
					{#each category.subcategories as subcategory, index (`${index}:${subcategory}`)}
						<li
							class="flex min-w-0 items-center gap-1 rounded-lg border border-border bg-surface p-2 sm:gap-2"
						>
							<span class="min-w-0 flex-1 truncate px-2 text-sm text-text">{subcategory}</span>
							<div class="flex shrink-0 items-center">
								<button
									type="button"
									class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[6px] text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
									aria-label={t('settings.categories.moveUpAria', { name: subcategory })}
									disabled={busy || index === 0}
									onclick={() => void moveSubcategory(index, -1)}
								>
									<ArrowUp class="size-4" />
								</button>
								<button
									type="button"
									class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[6px] text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
									aria-label={t('settings.categories.moveDownAria', { name: subcategory })}
									disabled={busy || index === category.subcategories.length - 1}
									onclick={() => void moveSubcategory(index, 1)}
								>
									<ArrowDown class="size-4" />
								</button>
								<button
									type="button"
									class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[6px] text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
									aria-label={t('settings.categories.editSubcategoryAria', {
										name: subcategory
									})}
									disabled={busy}
									onclick={() => openEdit(index, subcategory)}
								>
									<Pencil class="size-4" />
								</button>
								<button
									type="button"
									class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[6px] text-text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-40"
									aria-label={t('settings.categories.deleteSubcategoryAria', {
										name: subcategory
									})}
									disabled={busy}
									onclick={() => openDelete(index, subcategory)}
								>
									<Trash2 class="size-4" />
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<Dialog
	bind:open={editOpen}
	title={editIndex === null
		? t('settings.categories.newSubcategoryTitle')
		: t('settings.categories.editSubcategoryTitle')}
>
	<form class="grid gap-3" onsubmit={submitSubcategory}>
		{#if error}
			<p class="text-sm text-danger">{error}</p>
		{/if}
		<label class="grid gap-1">
			<span class={labelClass}>{t('settings.categories.subcategoryName')}</span>
			<input
				class={`${fieldClass} min-h-11`}
				bind:value={formName}
				required
				maxlength="128"
				disabled={busy}
			/>
		</label>
		<div class="mt-2 flex min-w-0 flex-wrap justify-end gap-2">
			<Button
				class="min-h-11"
				type="button"
				variant="outline"
				disabled={busy}
				onclick={() => (editOpen = false)}
			>
				{t('common.cancel')}
			</Button>
			<Button class="min-h-11" type="submit" disabled={busy || !formName.trim()}>
				{busy ? t('common.saving') : t('common.save')}
			</Button>
		</div>
	</form>
</Dialog>

<Dialog
	bind:open={deleteOpen}
	title={t('settings.categories.deleteSubcategoryTitle')}
	description={t('settings.categories.deleteSubcategoryDescription', { name: deleteName })}
>
	{#if error}
		<p class="mb-3 text-sm text-danger">{error}</p>
	{/if}
	<div class="flex min-w-0 flex-wrap justify-end gap-2">
		<Button
			class="min-h-11"
			type="button"
			variant="outline"
			disabled={busy}
			onclick={() => (deleteOpen = false)}
		>
			{t('common.cancel')}
		</Button>
		<Button
			class="min-h-11"
			type="button"
			variant="destructive"
			disabled={busy}
			onclick={() => void removeSubcategory()}
		>
			{busy ? t('common.saving') : t('settings.categories.deleteSubcategoryConfirm')}
		</Button>
	</div>
</Dialog>

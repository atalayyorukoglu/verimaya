<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { FinanceCategory, FinanceCategoryCreate } from '@verimaya/shared';
	import { apiPaths, transactionKindLabels } from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass, labelClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	const queryClient = useQueryClient();
	const { keys, ready } = useQueryScope();

	const catsQuery = createQuery(() => ({
		queryKey: keys.settings.financeCategories(),
		queryFn: () => apiGet<{ items: FinanceCategory[] }>(apiPaths.settingsFinanceCategories),
		enabled: ready
	}));

	const items = $derived(
		[...(catsQuery.data?.items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
	);

	let dialogOpen = $state(false);
	let editing = $state<FinanceCategory | null>(null);
	let formKind = $state<'income' | 'expense'>('expense');
	let formName = $state('');
	let formSubs = $state('');
	let saving = $state(false);
	let formError = $state<string | null>(null);

	function openCreate() {
		editing = null;
		formKind = 'expense';
		formName = '';
		formSubs = '';
		formError = null;
		dialogOpen = true;
	}

	function openEdit(cat: FinanceCategory) {
		editing = cat;
		formKind = cat.kind;
		formName = cat.name;
		formSubs = cat.subcategories.join(', ');
		formError = null;
		dialogOpen = true;
	}

	function parseSubs(raw: string): string[] {
		return raw
			.split(/[,;\n]/)
			.map((s) => s.trim())
			.filter(Boolean);
	}

	async function save(e: Event) {
		e.preventDefault();
		const name = formName.trim();
		if (!name) return;
		saving = true;
		formError = null;
		const subcategories = parseSubs(formSubs);
		try {
			if (editing) {
				await apiSend(apiPaths.settingsFinanceCategory(editing.id), 'PATCH', {
					kind: formKind,
					name,
					subcategories
				});
			} else {
				const payload: FinanceCategoryCreate = { kind: formKind, name, subcategories };
				await apiSend(apiPaths.settingsFinanceCategories, 'POST', payload);
			}
			await queryClient.invalidateQueries({ queryKey: keys.settings.financeCategories() });
			dialogOpen = false;
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Kayıt başarısız';
		} finally {
			saving = false;
		}
	}

	async function remove(cat: FinanceCategory) {
		if (!confirm(`“${cat.name}” silinsin mi?`)) return;
		await apiSend(apiPaths.settingsFinanceCategory(cat.id), 'DELETE');
		await queryClient.invalidateQueries({ queryKey: keys.settings.financeCategories() });
	}
</script>

<svelte:head>
	<title>Kategoriler · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader title="Kategoriler" description="Gelir/gider kategorileri ve alt kategoriler.">
		{#snippet actions()}
			<Button type="button" size="sm" onclick={openCreate}>
				<Plus class="size-3.5" />
				Yeni
			</Button>
		{/snippet}
	</PageHeader>

	{#if catsQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if catsQuery.isError}
		<p class="text-sm text-danger">Kategoriler yüklenemedi.</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">Henüz kategori yok.</p>
			<Button class="mt-4" type="button" onclick={openCreate}>İlk kategoriyi ekle</Button>
		</div>
	{:else}
		<ul class="space-y-2">
			{#each items as cat (cat.id)}
				<li
					class="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-surface p-3 sm:p-4"
				>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<p class="font-medium text-text">{cat.name}</p>
							<span
								class="rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold {cat.kind === 'income'
									? 'bg-success/15 text-success'
									: 'bg-surface-2 text-text-muted'}"
							>
								{transactionKindLabels[cat.kind]}
							</span>
						</div>
						{#if cat.subcategories.length > 0}
							<p class="mt-1 text-xs text-text-muted">
								{cat.subcategories.join(' · ')}
							</p>
						{:else}
							<p class="mt-1 text-xs text-text-faint">Alt kategori yok</p>
						{/if}
					</div>
					<div class="flex shrink-0 gap-1">
						<button
							type="button"
							class="cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-text"
							aria-label="Düzenle"
							onclick={() => openEdit(cat)}
						>
							<Pencil class="size-3.5" />
						</button>
						<button
							type="button"
							class="cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger"
							aria-label="Sil"
							onclick={() => remove(cat)}
						>
							<Trash2 class="size-3.5" />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="mt-4 text-xs text-text-faint">
		Raporlar → Kategori sekmesi bu sözlüğü kullanacak (Faz 1’de sunucu tarafı bağlanır). Demo’da
		işlem `subtitle` alanları bu alt kategorilerle uyumlu seed edildi.
	</p>
</div>

<Dialog bind:open={dialogOpen} title={editing ? 'Kategori düzenle' : 'Yeni kategori'}>
	<form class="grid gap-3" onsubmit={save}>
		{#if formError}
			<p class="text-sm text-danger">{formError}</p>
		{/if}
		<label class="grid gap-1">
			<span class={labelClass}>Tür</span>
			<select class={fieldClass} bind:value={formKind}>
				<option value="income">Gelir</option>
				<option value="expense">Gider</option>
			</select>
		</label>
		<label class="grid gap-1">
			<span class={labelClass}>Ad</span>
			<input class={fieldClass} bind:value={formName} required maxlength="128" />
		</label>
		<label class="grid gap-1">
			<span class={labelClass}>Alt kategoriler</span>
			<textarea
				class="min-h-20 w-full rounded-[6px] border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40"
				bind:value={formSubs}
				placeholder="Virgülle ayır: Saç ekimi, İmplant, Genel"></textarea>
		</label>
		<div class="mt-2 flex justify-end gap-2">
			<Button type="button" variant="outline" onclick={() => (dialogOpen = false)}>İptal</Button>
			<Button type="submit" disabled={saving}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Button>
		</div>
	</form>
</Dialog>

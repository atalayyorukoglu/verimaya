<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		Contact,
		ContactDuplicateGroup,
		DuplicateMatchType,
		Patient,
		PatientDuplicateGroup
	} from '@verimaya/shared';
	import { apiPaths, duplicateMatchTypeLabels } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { Button } from '$lib/components/ui/button';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type Kind = 'contacts' | 'patients';
	type AnyGroup = ContactDuplicateGroup | PatientDuplicateGroup;

	let {
		kind,
		listHref,
		listLabel
	}: {
		kind: Kind;
		listHref: string;
		listLabel: string;
	} = $props();

	const queryClient = useQueryClient();

	let keepByGroup = $state<Record<string, string>>({});
	let mergingKey = $state<string | null>(null);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);

	const groupsQuery = createQuery(() => ({
		queryKey: [kind, 'duplicate-groups'] as const,
		queryFn: async (): Promise<{ items: AnyGroup[] }> => {
			if (kind === 'contacts') {
				return apiGet<{ items: ContactDuplicateGroup[] }>(apiPaths.contactsDuplicateGroups);
			}
			return apiGet<{ items: PatientDuplicateGroup[] }>(apiPaths.patientsDuplicateGroups);
		}
	}));

	const groups = $derived(groupsQuery.data?.items ?? []);

	function groupKey(match_type: DuplicateMatchType, label: string): string {
		return `${match_type}:${label}`;
	}

	function contactRows(g: AnyGroup): Array<{
		id: string;
		title: string;
		subtitle: string;
		meta?: string;
	}> {
		if ('contacts' in g) {
			return g.contacts.map((c: Contact) => ({
				id: c.id,
				title: c.display_name,
				subtitle: [c.phone, c.email].filter(Boolean).join(' · ') || 'İletişim yok',
				meta: `${c.contact_type_name} · kullanım ${c.usage_count}`
			}));
		}
		return g.patients.map((p: Patient) => ({
			id: p.id,
			title: p.full_name,
			subtitle: [p.phone, p.email].filter(Boolean).join(' · ') || 'İletişim yok',
			meta: p.status
		}));
	}

	function ensureKeep(g: AnyGroup): string {
		const key = groupKey(g.match_type, g.label);
		const rows = contactRows(g);
		const current = keepByGroup[key];
		if (current && rows.some((r) => r.id === current)) return current;
		return rows[0]?.id ?? '';
	}

	async function mergeGroup(g: AnyGroup) {
		const key = groupKey(g.match_type, g.label);
		const keep_id = ensureKeep(g);
		const rows = contactRows(g);
		const merge_ids = rows.map((r) => r.id).filter((id) => id !== keep_id);
		if (!keep_id || merge_ids.length === 0) return;

		mergingKey = key;
		error = null;
		success = null;
		try {
			const path = kind === 'contacts' ? apiPaths.contactsMerge : apiPaths.patientsMerge;
			await apiSend(path, 'POST', { keep_id, merge_ids });
			await queryClient.invalidateQueries({ queryKey: [kind, 'duplicate-groups'] });
			await queryClient.invalidateQueries({
				queryKey: [kind === 'contacts' ? 'contacts' : 'patients']
			});
			success = `${merge_ids.length} kayıt birleştirildi.`;
			const next = { ...keepByGroup };
			delete next[key];
			keepByGroup = next;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Birleştirme başarısız';
		} finally {
			mergingKey = null;
		}
	}
</script>

<a href={listHref} class="mb-4 inline-block text-sm text-info hover:underline">← {listLabel}</a>

<p class="mb-4 text-sm text-text-muted">
	E-posta, telefon (normalize) veya ada göre olası çift kayıtlar. Bir kayıt seçip diğerlerini içine
	birleştirin — bağlı işlem ve randevular taşınır.
</p>

{#if error}
	<p class="mb-3 text-sm text-danger">{error}</p>
{/if}
{#if success}
	<p class="mb-3 text-sm text-success">{success}</p>
{/if}

{#if groupsQuery.isPending}
	<p class="text-sm text-text-muted">Taranıyor…</p>
{:else if groupsQuery.isError}
	<p class="text-sm text-danger">Çift kayıt listesi yüklenemedi.</p>
{:else if groups.length === 0}
	<div class="rounded-lg border border-border bg-surface p-8 text-center">
		<p class="text-sm font-medium text-text">Çift kayıt bulunamadı</p>
		<p class="mt-1 text-xs text-text-muted">Telefon, e-posta veya ad çakışması yok.</p>
	</div>
{:else}
	<ul class="space-y-4">
		{#each groups as g (groupKey(g.match_type, g.label))}
			{@const key = groupKey(g.match_type, g.label)}
			{@const rows = contactRows(g)}
			{@const keepId = keepByGroup[key] ?? rows[0]?.id ?? ''}
			<li class="overflow-hidden rounded-lg border border-border bg-surface">
				<div class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
					<StatusBadge label={duplicateMatchTypeLabels[g.match_type]} tone="warning" />
					<span class="truncate font-mono text-xs text-text-muted">{g.label}</span>
					<span class="text-xs text-text-faint">{rows.length} kayıt</span>
				</div>
				<ul class="divide-y divide-border">
					{#each rows as row (row.id)}
						<li class="flex min-w-0 items-start gap-3 px-3 py-3 sm:px-4">
							<input
								type="radio"
								name={`keep-${key}`}
								class="mt-1"
								checked={keepId === row.id}
								onchange={() => {
									keepByGroup = { ...keepByGroup, [key]: row.id };
								}}
							/>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-text">{row.title}</p>
								<p class="mt-0.5 truncate text-xs text-text-faint">{row.subtitle}</p>
								{#if row.meta}
									<p class="mt-0.5 text-xs text-text-muted">{row.meta}</p>
								{/if}
							</div>
							<a
								href={kind === 'contacts' ? `/kisiler/${row.id}` : `/hastalar/${row.id}`}
								class="shrink-0 text-xs text-brand hover:underline"
							>
								Aç
							</a>
						</li>
					{/each}
				</ul>
				<div class="flex justify-end border-t border-border px-3 py-2.5 sm:px-4">
					<Button
						type="button"
						size="sm"
						disabled={mergingKey === key || rows.length < 2}
						onclick={() => mergeGroup(g)}
					>
						{mergingKey === key ? 'Birleştiriliyor…' : 'Seçileni tut, diğerlerini birleştir'}
					</Button>
				</div>
			</li>
		{/each}
	</ul>
{/if}

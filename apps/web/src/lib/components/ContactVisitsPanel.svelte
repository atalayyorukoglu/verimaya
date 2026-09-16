<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { ContactVisit, ContactVisitCreate } from '@verimaya/shared';
	import {
		apiPaths,
		contactVisitDateRangeLabel,
		contactVisitHotelCoveredByLabels,
		contactVisitStatusLabels,
		contactVisitTypeLabels
	} from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import ContactVisitFormDialog from '$lib/components/ContactVisitFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';

	/**
	 * VIZIT-01 — kişi kartındaki vizit listesi. Satıra tıklayınca düzenleme dialog'u
	 * açılır; "Viziti iptal et" yumuşak siler (satır `cancelled` olur, kaybolmaz).
	 *
	 * Dar ekranda tablo yok: her vizit kendi kartında, alanlar alt alta akıyor —
	 * 400px'te yatay taşma olmuyor.
	 */
	let { contactId }: { contactId: string } = $props();

	const qs = useQueryScope();
	const queryClient = useQueryClient();

	let formOpen = $state(false);
	let editing = $state<ContactVisit | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	const visitsQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.visits(contactId),
		queryFn: () => apiGet<{ items: ContactVisit[] }>(apiPaths.contactVisits(contactId)),
		enabled: qs.ready
	}));

	const visits = $derived(visitsQuery.data?.items ?? []);

	function openCreate() {
		editing = null;
		formError = null;
		formOpen = true;
	}

	function openEdit(visit: ContactVisit) {
		editing = visit;
		formError = null;
		formOpen = true;
	}

	async function tazele() {
		await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.visits(contactId) });
		// Özet vizitleri veri olarak okuyor; vizit değişince bayatlar.
		await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.summary(contactId) });
	}

	async function save(data: ContactVisitCreate) {
		saving = true;
		formError = null;
		try {
			if (editing) {
				await apiSend(apiPaths.contactVisit(contactId, editing.id), 'PATCH', data);
			} else {
				await apiSend(apiPaths.contactVisits(contactId), 'POST', data);
			}
			formOpen = false;
			await tazele();
		} catch (err) {
			formError = err instanceof Error ? err.message : t('contacts.visits.saveFailed');
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!editing) return;
		saving = true;
		formError = null;
		try {
			await apiSend(apiPaths.contactVisit(contactId, editing.id), 'DELETE');
			formOpen = false;
			await tazele();
		} catch (err) {
			formError = err instanceof Error ? err.message : t('contacts.visits.deleteFailed');
		} finally {
			saving = false;
		}
	}

	function aralik(v: ContactVisit): string {
		return contactVisitDateRangeLabel(v) || t('contacts.visits.noDate');
	}

	/** Alt satırdaki "otel · klinik · hekim · transfer" — boş alanlar hiç yazılmaz. */
	function ayrinti(v: ContactVisit): string {
		return [
			v.hotel
				? `${v.hotel}${v.hotel_covered_by !== 'unknown' ? ` (${contactVisitHotelCoveredByLabels[v.hotel_covered_by]})` : ''}`
				: null,
			v.clinic,
			v.doctor,
			v.transfer_provider
		]
			.filter(Boolean)
			.join(' · ');
	}
</script>

<section class="mb-4">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-sm font-semibold text-text">{t('contacts.visits.title')}</h2>
		<Button type="button" size="sm" variant="secondary" onclick={openCreate}>
			{t('contacts.visits.new')}
		</Button>
	</div>

	{#if visitsQuery.isPending}
		<p class="text-sm text-text-muted">{t('contacts.visits.loading')}</p>
	{:else if visitsQuery.isError}
		<p class="text-sm text-danger">{t('contacts.visits.error')}</p>
	{:else if visits.length === 0}
		<div class="rounded-lg border border-border bg-surface p-6 text-center">
			<p class="text-sm text-text-muted">{t('contacts.visits.empty')}</p>
		</div>
	{:else}
		<ul class="space-y-2">
			{#each visits as v (v.id)}
				<li>
					<button
						type="button"
						class="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-brand/40"
						onclick={() => openEdit(v)}
					>
						<div class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
							<span class="text-sm font-semibold text-text">
								{contactVisitTypeLabels[v.visit_type]}
							</span>
							<span
								class="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] leading-4 font-medium text-text-muted"
							>
								{contactVisitStatusLabels[v.status]}
							</span>
						</div>
						<p class="mt-0.5 text-xs break-words text-text-muted tabular-nums">{aralik(v)}</p>
						{#if ayrinti(v)}
							<p class="mt-0.5 text-xs break-words text-text-faint">{ayrinti(v)}</p>
						{/if}
						{#if v.treatment_plan}
							<p class="mt-1 text-xs break-words text-text-muted">{v.treatment_plan}</p>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<ContactVisitFormDialog
	bind:open={formOpen}
	visit={editing}
	{saving}
	error={formError}
	onsubmit={save}
	ondelete={editing ? remove : undefined}
/>

<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { PatientCaseNote } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDateTime } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';

	let {
		patientId,
		variant = 'card',
		canWrite = true
	}: {
		patientId: string;
		variant?: 'card' | 'default';
		canWrite?: boolean;
	} = $props();

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const notesQuery = createQuery(() => ({
		queryKey: qs.keys.patients.caseNotes(patientId),
		queryFn: () => apiGet<{ items: PatientCaseNote[] }>(`/v1/patients/${patientId}/case-notes`),
		enabled: qs.ready
	}));

	let draft = $state('');
	let sending = $state(false);
	let deletingId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let listEl: HTMLDivElement | undefined = $state();

	const items = $derived(notesQuery.data?.items ?? []);
	const listMaxH = $derived(variant === 'card' ? 'max-h-40' : 'max-h-72');

	function scrollListToBottom() {
		const el = listEl;
		if (el) el.scrollTop = el.scrollHeight;
	}

	async function send() {
		const body = draft.trim();
		if (!body || sending || !canWrite) return;
		sending = true;
		error = null;
		try {
			await apiSend<PatientCaseNote>(`/v1/patients/${patientId}/case-notes`, 'POST', { body });
			draft = '';
			await queryClient.invalidateQueries({ queryKey: qs.keys.patients.caseNotes(patientId) });
			requestAnimationFrame(() => requestAnimationFrame(scrollListToBottom));
		} catch (err) {
			error = err instanceof Error ? err.message : t('patients.notes.sendFailed');
		} finally {
			sending = false;
		}
	}

	async function removeNote(id: string) {
		if (!canWrite || deletingId) return;
		if (!confirm(t('patients.notes.deleteConfirm'))) return;
		deletingId = id;
		error = null;
		try {
			await apiSend(`/v1/patients/${patientId}/case-notes/${id}`, 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.patients.caseNotes(patientId) });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Not silinemedi';
		} finally {
			deletingId = null;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	}
</script>

<div class="flex flex-col gap-2">
	<div
		bind:this={listEl}
		class="{listMaxH} min-h-10 space-y-2 overflow-y-auto rounded-[6px] border border-border bg-surface-2/40 p-2.5"
		role="log"
		aria-label={t('patients.notes.aria')}
	>
		{#if notesQuery.isPending}
			<p class="text-sm text-text-faint">{t('patients.notes.loading')}</p>
		{:else if notesQuery.isError}
			<p class="text-sm text-danger">{t('patients.notes.loadError')}</p>
		{:else if items.length === 0}
			<p class="text-sm text-text-faint">{t('patients.notes.empty')}</p>
		{:else}
			{#each items as note (note.id)}
				<div class="rounded-[6px] border border-border bg-surface px-3 py-2 text-sm shadow-sm">
					<div
						class="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs text-text-faint"
					>
						<span class="min-w-0 font-medium text-text-muted">{note.author_display_name}</span>
						<div class="flex shrink-0 items-center gap-1.5">
							<time datetime={note.created_at} class="tabular-nums">
								{formatDateTime(note.created_at)}
							</time>
							{#if canWrite}
								<button
									type="button"
									class="rounded p-0.5 text-text-faint transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-40"
									title="Notu sil"
									aria-label="Notu sil"
									disabled={deletingId === note.id || sending}
									onclick={() => void removeNote(note.id)}
								>
									<Trash2 class="size-3.5" />
								</button>
							{/if}
						</div>
					</div>
					<p class="mt-1.5 whitespace-pre-wrap text-text">{note.body}</p>
				</div>
			{/each}
		{/if}
	</div>

	{#if canWrite}
		<div class="flex items-end gap-2">
			<input
				class="h-9 min-w-0 flex-1 rounded-[6px] border border-border bg-surface px-3 text-base text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40 sm:text-sm"
				placeholder="Hasta notu yaz…"
				bind:value={draft}
				disabled={sending}
				onkeydown={onKeydown}
			/>
			<button
				type="button"
				class="inline-flex size-9 shrink-0 items-center justify-center rounded-[6px] bg-brand text-primary-foreground disabled:opacity-40"
				aria-label={t('patients.notes.sendAria')}
				disabled={sending || !draft.trim()}
				onclick={() => void send()}
			>
				<ArrowUp class="size-4" />
			</button>
		</div>
	{/if}

	{#if error}
		<p class="text-xs text-danger">{error}</p>
	{/if}
</div>

<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type {
		Contact,
		IncentiveDocumentItem,
		IncentiveFile,
		IncentiveFileCreate,
		IncentiveFileStatus,
		IncentiveFileUpdate
	} from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass, listUrl, textareaClass } from '$lib/api';
	import Combobox from '$lib/components/Combobox.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { type DeleteConfirmPhase, runConfirmedDelete } from '$lib/components/delete-confirm-flow';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import { useQueryScope } from '$lib/query-scope.svelte';

	let {
		open = $bindable(false),
		file = null,
		saving = false,
		error = null,
		onsubmit,
		ondelete
	}: {
		open?: boolean;
		file?: IncentiveFile | null;
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: IncentiveFileCreate | IncentiveFileUpdate) => void | Promise<void>;
		ondelete?: () => void | Promise<void>;
	} = $props();

	const qs = useQueryScope();
	const isEdit = $derived(file != null);

	const statusKeys = [
		'open',
		'submitted',
		'approved',
		'rejected',
		'expired'
	] as const satisfies readonly IncentiveFileStatus[];

	const statusMessageKey: Record<IncentiveFileStatus, MessageKey> = {
		open: 'finance.incentives.status.open',
		submitted: 'finance.incentives.status.submitted',
		approved: 'finance.incentives.status.approved',
		rejected: 'finance.incentives.status.rejected',
		expired: 'finance.incentives.status.expired'
	};

	let contact_id = $state('');
	let payment_date = $state('');
	let status = $state<IncentiveFileStatus>('open');
	let submitted_at = $state('');
	let note = $state('');
	let documents = $state<IncentiveDocumentItem[]>([]);
	let deletePhase = $state<DeleteConfirmPhase>('form');
	let hydratedFor = $state<string | null>(null);

	const contactsQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.list({ limit: 100 }),
		queryFn: () =>
			apiGet<{ items: Contact[]; next_cursor: string | null }>(listUrl('contacts', { limit: 100 })),
		enabled: open && qs.ready
	}));

	const contactOptions = $derived(
		(contactsQuery.data?.items ?? []).map((c) => ({
			value: c.id,
			label: c.display_name
		}))
	);

	function hydrate() {
		if (file) {
			contact_id = file.contact_id;
			payment_date = file.payment_date;
			status = file.status;
			submitted_at = file.submitted_at ?? '';
			note = file.note ?? '';
			documents = file.documents.map((d) => ({ ...d }));
			hydratedFor = file.id;
		} else {
			contact_id = '';
			payment_date = new Date().toISOString().slice(0, 10);
			status = 'open';
			submitted_at = '';
			note = '';
			documents = [];
			hydratedFor = 'new';
		}
		deletePhase = 'form';
	}

	$effect(() => {
		if (!open) {
			hydratedFor = null;
			return;
		}
		const key = file?.id ?? 'new';
		if (hydratedFor !== key) hydrate();
	});

	function toggleDoc(index: number) {
		const next = documents.map((d, i) => (i === index ? { ...d, done: !d.done } : d));
		documents = next;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (isEdit) {
			const payload: IncentiveFileUpdate = {
				status,
				submitted_at: submitted_at.trim() ? submitted_at : null,
				note: note.trim() ? note.trim() : null,
				documents
			};
			await onsubmit(payload);
			return;
		}
		if (!contact_id || !payment_date) return;
		const payload: IncentiveFileCreate = {
			contact_id,
			payment_date,
			note: note.trim() ? note.trim() : null
		};
		await onsubmit(payload);
	}

	async function handleDelete() {
		if (!ondelete) return;
		if (deletePhase === 'form') {
			deletePhase = 'confirm';
			return;
		}
		await runConfirmedDelete(deletePhase, () => Promise.resolve(ondelete()));
	}
</script>

<Dialog
	bind:open
	title={isEdit ? t('finance.incentives.form.editTitle') : t('finance.incentives.form.createTitle')}
>
	<form id="incentive-file-form" class="flex flex-col gap-3" onsubmit={handleSubmit}>
		{#if !isEdit}
			<div>
				<label class={labelClass} for="incentive-contact"
					>{t('finance.incentives.form.contact')}</label
				>
				<Combobox
					id="incentive-contact"
					options={contactOptions}
					bind:value={contact_id}
					placeholder={t('finance.incentives.form.contactPlaceholder')}
					emptyText={t('finance.form.contactEmpty')}
					clearLabel={t('finance.form.contactClear')}
				/>
			</div>
			<div>
				<label class={labelClass} for="incentive-payment"
					>{t('finance.incentives.form.paymentDate')}</label
				>
				<input
					id="incentive-payment"
					type="date"
					class={fieldClass}
					bind:value={payment_date}
					required
				/>
			</div>
		{:else}
			<p class="text-sm text-text">
				<span class="text-text-muted">{t('finance.incentives.form.contact')}:</span>
				{file?.contact_display_name}
			</p>
			<p class="text-sm text-text">
				<span class="text-text-muted">{t('finance.incentives.form.paymentDate')}:</span>
				{file?.payment_date}
			</p>
			<p class="text-sm text-text">
				<span class="text-text-muted">{t('finance.incentives.form.deadline')}:</span>
				{file?.deadline_at}
			</p>
			<p class="text-xs text-text-muted">{t('finance.incentives.form.deadlineHint')}</p>
			<div>
				<label class={labelClass} for="incentive-status"
					>{t('finance.incentives.form.status')}</label
				>
				<select id="incentive-status" class={fieldClass} bind:value={status}>
					{#each statusKeys as s (s)}
						<option value={s}>{t(statusMessageKey[s])}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class={labelClass} for="incentive-submitted"
					>{t('finance.incentives.form.submittedAt')}</label
				>
				<input id="incentive-submitted" type="date" class={fieldClass} bind:value={submitted_at} />
			</div>
			<div>
				<p class={labelClass}>{t('finance.incentives.form.documents')}</p>
				<ul class="mt-1 flex flex-col gap-2">
					{#each documents as doc, i (doc.key)}
						<li>
							<label class="flex items-center gap-2 text-sm text-text">
								<input type="checkbox" checked={doc.done} onchange={() => toggleDoc(i)} />
								{doc.label}
							</label>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div>
			<label class={labelClass} for="incentive-note">{t('finance.incentives.form.note')}</label>
			<textarea id="incentive-note" class={textareaClass} rows="3" bind:value={note}></textarea>
		</div>

		{#if error}
			<p class="text-sm text-danger">{error}</p>
		{/if}
	</form>

	{#snippet footer()}
		{#if deletePhase === 'confirm'}
			<p class="mr-auto max-w-[14rem] text-xs text-text-muted">
				{t('finance.incentives.form.deleteConfirmBody')}
			</p>
			<Button type="button" variant="outline" onclick={() => (deletePhase = 'form')}
				>{t('finance.incentives.form.cancel')}</Button
			>
			<Button type="button" variant="destructive" disabled={saving} onclick={handleDelete}>
				{saving
					? t('finance.incentives.form.deleting')
					: t('finance.incentives.form.deleteConfirmAction')}
			</Button>
		{:else}
			{#if isEdit && ondelete}
				<Button type="button" variant="outline" class="mr-auto text-danger" onclick={handleDelete}>
					{t('finance.incentives.form.delete')}
				</Button>
			{/if}
			<Button type="button" variant="outline" onclick={() => (open = false)}
				>{t('finance.incentives.form.cancel')}</Button
			>
			<Button type="submit" form="incentive-file-form" disabled={saving}>
				{saving ? t('finance.incentives.form.saving') : t('finance.incentives.form.save')}
			</Button>
		{/if}
	{/snippet}
</Dialog>

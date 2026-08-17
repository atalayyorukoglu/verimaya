<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type {
		CommissionEntry,
		CommissionEntryCreate,
		CommissionEntryStatus,
		CommissionEntryUpdate,
		Contact,
		SupportedCurrency
	} from '@verimaya/shared';
	import { supportedCurrencySchema } from '@verimaya/shared';
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
		entry = null,
		saving = false,
		error = null,
		onsubmit,
		ondelete
	}: {
		open?: boolean;
		entry?: CommissionEntry | null;
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: CommissionEntryCreate | CommissionEntryUpdate) => void | Promise<void>;
		ondelete?: () => void | Promise<void>;
	} = $props();

	const qs = useQueryScope();
	const isEdit = $derived(entry != null);
	const currencies = supportedCurrencySchema.options;

	const statusKeys = [
		'accrued',
		'paid',
		'cancelled'
	] as const satisfies readonly CommissionEntryStatus[];

	const statusMessageKey: Record<CommissionEntryStatus, MessageKey> = {
		accrued: 'finance.commissions.status.accrued',
		paid: 'finance.commissions.status.paid',
		cancelled: 'finance.commissions.status.cancelled'
	};

	let beneficiary_contact_id = $state('');
	let case_contact_id = $state('');
	let amountMajor = $state('');
	let currency = $state<SupportedCurrency>('TRY');
	let earned_on = $state('');
	let status = $state<CommissionEntryStatus>('accrued');
	let paid_on = $state('');
	let note = $state('');
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
		if (entry) {
			beneficiary_contact_id = entry.beneficiary_contact_id;
			case_contact_id = entry.case_contact_id ?? '';
			amountMajor = String(entry.amount / 100);
			currency = entry.currency;
			earned_on = entry.earned_on;
			status = entry.status;
			paid_on = entry.paid_on ?? '';
			note = entry.note ?? '';
			hydratedFor = entry.id;
		} else {
			beneficiary_contact_id = '';
			case_contact_id = '';
			amountMajor = '';
			currency = 'TRY';
			earned_on = new Date().toISOString().slice(0, 10);
			status = 'accrued';
			paid_on = '';
			note = '';
			hydratedFor = 'new';
		}
		deletePhase = 'form';
	}

	$effect(() => {
		if (!open) {
			hydratedFor = null;
			return;
		}
		const key = entry?.id ?? 'new';
		if (hydratedFor !== key) hydrate();
	});

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (isEdit) {
			const amount = Math.round(Number.parseFloat(amountMajor.replace(',', '.')) * 100);
			if (!Number.isFinite(amount) || amount <= 0) return;
			const payload: CommissionEntryUpdate = {
				status,
				paid_on: paid_on.trim() ? paid_on : null,
				amount,
				note: note.trim() ? note.trim() : null
			};
			await onsubmit(payload);
			return;
		}
		const amount = Math.round(Number.parseFloat(amountMajor.replace(',', '.')) * 100);
		if (!beneficiary_contact_id || !earned_on || !Number.isFinite(amount) || amount <= 0) return;
		const payload: CommissionEntryCreate = {
			beneficiary_contact_id,
			case_contact_id: case_contact_id || null,
			amount,
			currency,
			earned_on,
			status,
			paid_on: paid_on.trim() ? paid_on : null,
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
	title={isEdit
		? t('finance.commissions.form.editTitle')
		: t('finance.commissions.form.createTitle')}
>
	<form id="commission-entry-form" class="flex flex-col gap-3" onsubmit={handleSubmit}>
		{#if !isEdit}
			<div>
				<label class={labelClass} for="commission-beneficiary"
					>{t('finance.commissions.form.beneficiary')}</label
				>
				<Combobox
					id="commission-beneficiary"
					options={contactOptions}
					bind:value={beneficiary_contact_id}
					placeholder={t('finance.commissions.form.beneficiaryPlaceholder')}
					emptyText={t('finance.form.contactEmpty')}
					clearLabel={t('finance.form.contactClear')}
				/>
			</div>
			<div>
				<label class={labelClass} for="commission-case">{t('finance.commissions.form.case')}</label>
				<Combobox
					id="commission-case"
					options={contactOptions}
					bind:value={case_contact_id}
					placeholder={t('finance.commissions.form.casePlaceholder')}
					emptyText={t('finance.form.contactEmpty')}
					clearLabel={t('finance.form.contactClear')}
				/>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class={labelClass} for="commission-amount"
						>{t('finance.commissions.form.amount')}</label
					>
					<input
						id="commission-amount"
						type="text"
						inputmode="decimal"
						class={fieldClass}
						bind:value={amountMajor}
						required
					/>
				</div>
				<div>
					<label class={labelClass} for="commission-currency"
						>{t('finance.commissions.form.currency')}</label
					>
					<select id="commission-currency" class={fieldClass} bind:value={currency}>
						{#each currencies as c (c)}
							<option value={c}>{c}</option>
						{/each}
					</select>
				</div>
			</div>
			<div>
				<label class={labelClass} for="commission-earned"
					>{t('finance.commissions.form.earnedOn')}</label
				>
				<input
					id="commission-earned"
					type="date"
					class={fieldClass}
					bind:value={earned_on}
					required
				/>
			</div>
		{:else}
			<p class="text-sm text-text">
				<span class="text-text-muted">{t('finance.commissions.form.beneficiary')}:</span>
				{entry?.beneficiary_display_name}
			</p>
			<p class="text-sm text-text">
				<span class="text-text-muted">{t('finance.commissions.form.case')}:</span>
				{entry?.case_display_name ?? t('finance.commissions.dash')}
			</p>
			<p class="text-sm text-text">
				<span class="text-text-muted">{t('finance.commissions.form.earnedOn')}:</span>
				{entry?.earned_on}
			</p>
			<div>
				<label class={labelClass} for="commission-amount-edit"
					>{t('finance.commissions.form.amount')}</label
				>
				<input
					id="commission-amount-edit"
					type="text"
					inputmode="decimal"
					class={fieldClass}
					bind:value={amountMajor}
					required
				/>
			</div>
		{/if}

		<div>
			<label class={labelClass} for="commission-status"
				>{t('finance.commissions.form.status')}</label
			>
			<select id="commission-status" class={fieldClass} bind:value={status}>
				{#each statusKeys as s (s)}
					<option value={s}>{t(statusMessageKey[s])}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class={labelClass} for="commission-paid">{t('finance.commissions.form.paidOn')}</label>
			<input id="commission-paid" type="date" class={fieldClass} bind:value={paid_on} />
		</div>
		<div>
			<label class={labelClass} for="commission-note">{t('finance.commissions.form.note')}</label>
			<textarea id="commission-note" class={textareaClass} rows="3" bind:value={note}></textarea>
		</div>

		{#if error}
			<p class="text-sm text-danger">{error}</p>
		{/if}
	</form>

	{#snippet footer()}
		{#if deletePhase === 'confirm'}
			<p class="mr-auto max-w-[14rem] text-xs text-text-muted">
				{t('finance.commissions.form.deleteConfirmBody')}
			</p>
			<Button type="button" variant="outline" onclick={() => (deletePhase = 'form')}
				>{t('finance.commissions.form.cancel')}</Button
			>
			<Button type="button" variant="destructive" disabled={saving} onclick={handleDelete}>
				{saving
					? t('finance.commissions.form.deleting')
					: t('finance.commissions.form.deleteConfirmAction')}
			</Button>
		{:else}
			{#if isEdit && ondelete}
				<Button type="button" variant="outline" class="mr-auto text-danger" onclick={handleDelete}>
					{t('finance.commissions.form.delete')}
				</Button>
			{/if}
			<Button type="button" variant="outline" onclick={() => (open = false)}
				>{t('finance.commissions.form.cancel')}</Button
			>
			<Button type="submit" form="commission-entry-form" disabled={saving || !amountMajor}>
				{saving ? t('finance.commissions.form.saving') : t('finance.commissions.form.save')}
			</Button>
		{/if}
	{/snippet}
</Dialog>

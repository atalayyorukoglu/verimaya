<script lang="ts">
	import type {
		Contact,
		ContactType,
		FinanceCategory,
		TransactionDraft,
		TransactionEvidenceEntry,
		TransactionStatus
	} from '@verimaya/shared';
	import { transactionKindLabels, transactionStatusLabels } from '@verimaya/shared';
	import { fieldClass, labelClass, textareaClass } from '$lib/api';
	import { formatMoney } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import EvidenceBadge from '$lib/components/EvidenceBadge.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';

	export type DraftApprovalState = TransactionDraft & {
		status: TransactionStatus | null;
		paid_amount: number | null;
		fx_rate: number | null;
		amount_base: number | null;
		contact_id: string | null;
		_status: 'idle' | 'saving' | 'saved' | 'error';
		_error: string | null;
	};

	const NEW = '__new__';

	let {
		draft,
		contacts = [],
		categories = [],
		contactTypes = [],
		baseCurrency = 'TRY',
		creating = false,
		onchange,
		onCreateContact,
		onCreateCategory,
		onEvidence
	}: {
		draft: DraftApprovalState;
		contacts?: Contact[];
		categories?: FinanceCategory[];
		contactTypes?: ContactType[];
		baseCurrency?: string;
		creating?: boolean;
		onchange: (patch: Partial<DraftApprovalState>) => void;
		onCreateContact: (input: {
			first_name: string;
			last_name?: string | null;
			contact_type_id: string;
			phone?: string | null;
			email?: string | null;
		}) => Promise<void>;
		onCreateCategory: (input: { name: string; kind: TransactionDraft['kind'] }) => Promise<void>;
		/** AI-09 — kaynak rozetine tıklanınca üstteki mesaj metninde alıntıyı vurgular. */
		onEvidence?: (entry: TransactionEvidenceEntry) => void;
	} = $props();

	const kinds = Object.keys(transactionKindLabels) as TransactionDraft['kind'][];
	const statuses = Object.keys(transactionStatusLabels) as TransactionStatus[];
	const currencies = ['TRY', 'GBP', 'USD', 'EUR'] as const;

	const amountMajor = $derived(String(draft.amount / 100));
	const paidMajor = $derived(draft.paid_amount == null ? '' : String(draft.paid_amount / 100));
	const amountBaseMajor = $derived(
		draft.amount_base == null ? '' : String(draft.amount_base / 100)
	);
	const saved = $derived(draft._status === 'saved');
	const sameCurrency = $derived(draft.currency === baseCurrency);
	const instanceId = crypto.randomUUID();
	const fieldId = (name: string) => `draft-${instanceId}-${name}`;

	const categoryOptions = $derived(
		categories
			.filter((c) => c.kind === draft.kind)
			.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
	);

	let showNewContact = $state(false);
	let showNewCategory = $state(false);
	let newContactName = $state('');
	let newContactTypeId = $state('');
	let newContactPhone = $state('');
	let newContactEmail = $state('');
	let newCategoryName = $state('');
	let createError = $state<string | null>(null);

	function splitDisplayName(name: string): { first_name: string; last_name: string | null } {
		const trimmed = name.trim();
		const spaceIdx = trimmed.indexOf(' ');
		if (spaceIdx === -1) return { first_name: trimmed, last_name: null };
		return {
			first_name: trimmed.slice(0, spaceIdx),
			last_name: trimmed.slice(spaceIdx + 1).trim() || null
		};
	}

	function onAmountInput(value: string) {
		const n = Number.parseFloat(value.replace(',', '.'));
		if (!Number.isFinite(n) || n <= 0) return;
		const amount = Math.round(n * 100);
		const patch: Partial<DraftApprovalState> = { amount };
		if (draft.status === 'paid') patch.paid_amount = amount;
		if (sameCurrency) patch.amount_base = amount;
		onchange(patch);
	}

	function onPaidInput(value: string) {
		const n = Number.parseFloat(value.replace(',', '.'));
		if (!Number.isFinite(n) || n < 0) return;
		onchange({ paid_amount: Math.round(n * 100) });
	}

	function onFxInput(value: string) {
		const n = Number.parseFloat(value.replace(',', '.'));
		if (!Number.isFinite(n) || n <= 0) return;
		const patch: Partial<DraftApprovalState> = { fx_rate: n };
		if (!sameCurrency) {
			patch.amount_base = Math.round((draft.amount / 100) * n * 100);
		}
		onchange(patch);
	}

	function onAmountBaseInput(value: string) {
		const n = Number.parseFloat(value.replace(',', '.'));
		if (!Number.isFinite(n) || n < 0) return;
		onchange({ amount_base: Math.round(n * 100) });
	}

	function onStatusChange(status: TransactionStatus) {
		const patch: Partial<DraftApprovalState> = { status };
		if (status === 'paid') patch.paid_amount = draft.amount;
		if (status === 'unpaid') patch.paid_amount = 0;
		onchange(patch);
	}

	function onCurrencyChange(currency: (typeof currencies)[number]) {
		const patch: Partial<DraftApprovalState> = { currency };
		if (currency === baseCurrency) {
			patch.fx_rate = 1;
			patch.amount_base = draft.amount;
		} else {
			patch.fx_rate = null;
			patch.amount_base = null;
		}
		onchange(patch);
	}

	function resetCreateForms() {
		showNewContact = false;
		showNewCategory = false;
		newContactName = '';
		newContactTypeId = '';
		newContactPhone = '';
		newContactEmail = '';
		newCategoryName = '';
		createError = null;
	}

	async function submitNewContact() {
		if (!newContactName.trim() || !newContactTypeId || creating) return;
		createError = null;
		try {
			const { first_name, last_name } = splitDisplayName(newContactName);
			await onCreateContact({
				first_name,
				last_name,
				contact_type_id: newContactTypeId,
				phone: newContactPhone.trim() || null,
				email: newContactEmail.trim() || null
			});
			resetCreateForms();
		} catch (err) {
			createError = err instanceof Error ? err.message : t('finance.ai.create.failed');
		}
	}

	async function submitNewCategory() {
		if (!newCategoryName.trim() || creating) return;
		createError = null;
		try {
			await onCreateCategory({ name: newCategoryName.trim(), kind: draft.kind });
			resetCreateForms();
		} catch (err) {
			createError = err instanceof Error ? err.message : t('finance.ai.create.failed');
		}
	}
</script>

<div
	class="overflow-hidden rounded-lg border border-border p-4 sm:p-5 {saved
		? 'border-success/40 bg-success/5'
		: 'bg-surface'}"
>
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<StatusBadge
				label={transactionKindLabels[draft.kind]}
				tone={draft.kind === 'income' ? 'success' : 'danger'}
			/>
			<span class="text-sm font-semibold text-text tabular-nums">
				{formatMoney(draft.amount, draft.currency)}
			</span>
		</div>
		{#if saved}
			<span class="text-xs font-medium text-success">{t('finance.ai.draft.saved')}</span>
		{/if}
	</div>

	<div class="grid gap-3 sm:grid-cols-2">
		<div>
			<div class="flex items-center justify-between gap-2">
				<label class={labelClass} for={fieldId('kind')}>{t('finance.ai.draft.kind')}</label>
				<EvidenceBadge entry={draft.evidence?.kind} onselect={onEvidence} />
			</div>
			<select
				id={fieldId('kind')}
				class={fieldClass}
				disabled={saved}
				value={draft.kind}
				onchange={(e) => onchange({ kind: e.currentTarget.value as TransactionDraft['kind'] })}
			>
				{#each kinds as k (k)}
					<option value={k}>{transactionKindLabels[k]}</option>
				{/each}
			</select>
		</div>

		<div>
			<div class="flex items-center justify-between gap-2">
				<label class={labelClass} for={fieldId('amount')}>{t('finance.ai.draft.amount')}</label>
				<EvidenceBadge entry={draft.evidence?.amount} onselect={onEvidence} />
			</div>
			<input
				id={fieldId('amount')}
				class={fieldClass}
				type="number"
				min="0"
				step="0.01"
				disabled={saved}
				value={amountMajor}
				oninput={(e) => onAmountInput(e.currentTarget.value)}
			/>
		</div>

		<div>
			<div class="flex items-center justify-between gap-2">
				<label class={labelClass} for={fieldId('currency')}>{t('finance.ai.draft.currency')}</label>
				<EvidenceBadge entry={draft.evidence?.currency} onselect={onEvidence} />
			</div>
			<select
				id={fieldId('currency')}
				class={fieldClass}
				disabled={saved}
				value={draft.currency}
				onchange={(e) => onCurrencyChange(e.currentTarget.value as (typeof currencies)[number])}
			>
				{#each currencies as c (c)}
					<option value={c}>{c}</option>
				{/each}
			</select>
		</div>

		<div>
			<div class="flex items-center justify-between gap-2">
				<label class={labelClass} for={fieldId('date')}>{t('finance.ai.draft.date')}</label>
				<EvidenceBadge entry={draft.evidence?.occurred_on} onselect={onEvidence} />
			</div>
			<input
				id={fieldId('date')}
				class={fieldClass}
				type="date"
				disabled={saved}
				value={draft.occurred_on}
				onchange={(e) => onchange({ occurred_on: e.currentTarget.value })}
			/>
		</div>

		<div class="sm:col-span-2">
			<label class={labelClass} for={fieldId('title')}>{t('finance.ai.draft.title')}</label>
			<input
				id={fieldId('title')}
				class={fieldClass}
				disabled={saved}
				value={draft.title}
				oninput={(e) => onchange({ title: e.currentTarget.value })}
			/>
		</div>

		<div>
			<div class="flex items-center justify-between gap-2">
				<label class={labelClass} for={fieldId('category')}>{t('finance.ai.draft.category')}</label>
				<EvidenceBadge entry={draft.evidence?.category} onselect={onEvidence} />
			</div>
			<select
				id={fieldId('category')}
				class={fieldClass}
				disabled={saved || creating}
				value={showNewCategory ? NEW : (draft.category ?? '')}
				onchange={(e) => {
					const v = e.currentTarget.value;
					if (v === NEW) {
						showNewCategory = true;
						createError = null;
						return;
					}
					showNewCategory = false;
					onchange({ category: v || null });
				}}
			>
				<option value="">{t('finance.ai.draft.categoryNone')}</option>
				{#each categoryOptions as c (c.id)}
					<option value={c.name}>{c.name}</option>
				{/each}
				{#if draft.category && !categoryOptions.some((c) => c.name === draft.category)}
					<option value={draft.category}>{draft.category}</option>
				{/if}
				<option value={NEW}>{t('finance.ai.draft.categoryNew')}</option>
			</select>
			{#if showNewCategory}
				<div class="mt-2 space-y-2 rounded-[6px] border border-border bg-surface-2 p-3">
					<label class={labelClass} for={fieldId('new-cat-name')}
						>{t('finance.ai.create.categoryName')}</label
					>
					<input
						id={fieldId('new-cat-name')}
						class={fieldClass}
						disabled={creating}
						bind:value={newCategoryName}
					/>
					<div class="flex flex-wrap gap-2">
						<Button
							size="sm"
							type="button"
							disabled={creating || !newCategoryName.trim()}
							onclick={() => void submitNewCategory()}
						>
							{creating ? t('finance.ai.create.saving') : t('finance.ai.create.save')}
						</Button>
						<Button
							size="sm"
							variant="outline"
							type="button"
							disabled={creating}
							onclick={resetCreateForms}
						>
							{t('finance.ai.create.cancel')}
						</Button>
					</div>
				</div>
			{/if}
		</div>

		<div>
			<div class="flex items-center justify-between gap-2">
				<label class={labelClass} for={fieldId('method')}
					>{t('finance.ai.draft.paymentMethod')}</label
				>
				<EvidenceBadge entry={draft.evidence?.payment_method} onselect={onEvidence} />
			</div>
			<input
				id={fieldId('method')}
				class={fieldClass}
				disabled={saved}
				value={draft.payment_method ?? ''}
				oninput={(e) => onchange({ payment_method: e.currentTarget.value || null })}
			/>
		</div>

		<div>
			<label class={labelClass} for={fieldId('status')}>{t('finance.ai.draft.status')}</label>
			<select
				id={fieldId('status')}
				class={fieldClass}
				disabled={saved}
				value={draft.status ?? ''}
				onchange={(e) => {
					const v = e.currentTarget.value;
					if (v) onStatusChange(v as TransactionStatus);
					else onchange({ status: null, paid_amount: null });
				}}
			>
				<option value="">{t('finance.ai.draft.statusNone')}</option>
				{#each statuses as s (s)}
					<option value={s}>{transactionStatusLabels[s]}</option>
				{/each}
			</select>
		</div>

		<div>
			<label class={labelClass} for={fieldId('paid')}>{t('finance.ai.draft.paidAmount')}</label>
			<input
				id={fieldId('paid')}
				class={fieldClass}
				type="number"
				min="0"
				step="0.01"
				disabled={saved || draft.status === 'paid' || draft.status === 'unpaid'}
				value={paidMajor}
				oninput={(e) => onPaidInput(e.currentTarget.value)}
			/>
		</div>

		<div>
			<label class={labelClass} for={fieldId('fx')}>{t('finance.ai.draft.fxRate')}</label>
			<input
				id={fieldId('fx')}
				class={fieldClass}
				type="number"
				min="0"
				step="0.0001"
				disabled={saved || sameCurrency}
				value={draft.fx_rate ?? ''}
				oninput={(e) => onFxInput(e.currentTarget.value)}
			/>
		</div>

		<div>
			<label class={labelClass} for={fieldId('base')}>{t('finance.ai.draft.amountBase')}</label>
			<input
				id={fieldId('base')}
				class={fieldClass}
				type="number"
				min="0"
				step="0.01"
				disabled={saved || sameCurrency}
				value={amountBaseMajor}
				oninput={(e) => onAmountBaseInput(e.currentTarget.value)}
			/>
		</div>

		<div>
			<div class="flex items-center justify-between gap-2">
				<label class={labelClass} for={fieldId('contact')}>{t('finance.ai.draft.contact')}</label>
				<EvidenceBadge entry={draft.evidence?.contact_id} onselect={onEvidence} />
			</div>
			<select
				id={fieldId('contact')}
				class={fieldClass}
				disabled={saved || creating}
				value={showNewContact ? NEW : (draft.contact_id ?? '')}
				onchange={(e) => {
					const v = e.currentTarget.value;
					if (v === NEW) {
						showNewContact = true;
						createError = null;
						return;
					}
					showNewContact = false;
					if (!v) {
						onchange({ contact_id: null, contact_display_name: null });
						return;
					}
					const contact = contacts.find((c) => c.id === v);
					onchange({
						contact_id: v,
						contact_display_name: contact?.display_name ?? draft.contact_display_name,
						contact_label: contact?.display_name ?? draft.contact_label
					});
				}}
			>
				<option value="">{t('finance.ai.draft.contactNone')}</option>
				{#each contacts as c (c.id)}
					<option value={c.id}>{c.display_name}</option>
				{/each}
				<option value={NEW}>{t('finance.ai.draft.contactNew')}</option>
			</select>
			{#if showNewContact}
				<div class="mt-2 space-y-2 rounded-[6px] border border-border bg-surface-2 p-3">
					<label class={labelClass} for={fieldId('new-contact-name')}
						>{t('finance.ai.create.fullName')}</label
					>
					<input
						id={fieldId('new-contact-name')}
						class={fieldClass}
						disabled={creating}
						bind:value={newContactName}
					/>
					<label class={labelClass} for={fieldId('new-contact-type')}
						>{t('finance.ai.create.contactType')}</label
					>
					<select
						id={fieldId('new-contact-type')}
						class={fieldClass}
						disabled={creating}
						bind:value={newContactTypeId}
					>
						<option value="">{t('finance.ai.create.contactTypeNone')}</option>
						{#each contactTypes as ct (ct.id)}
							<option value={ct.id}>{ct.name}</option>
						{/each}
					</select>
					<label class={labelClass} for={fieldId('new-contact-phone')}
						>{t('finance.ai.create.phone')}</label
					>
					<input
						id={fieldId('new-contact-phone')}
						class={fieldClass}
						disabled={creating}
						bind:value={newContactPhone}
					/>
					<label class={labelClass} for={fieldId('new-contact-email')}
						>{t('finance.ai.create.email')}</label
					>
					<input
						id={fieldId('new-contact-email')}
						class={fieldClass}
						type="email"
						disabled={creating}
						bind:value={newContactEmail}
					/>
					<div class="flex flex-wrap gap-2">
						<Button
							size="sm"
							type="button"
							disabled={creating || !newContactName.trim() || !newContactTypeId}
							onclick={() => void submitNewContact()}
						>
							{creating ? t('finance.ai.create.saving') : t('finance.ai.create.save')}
						</Button>
						<Button
							size="sm"
							variant="outline"
							type="button"
							disabled={creating}
							onclick={resetCreateForms}
						>
							{t('finance.ai.create.cancel')}
						</Button>
					</div>
				</div>
			{:else if !draft.contact_id}
				<label class={`${labelClass} mt-2`} for={fieldId('contact-label')}
					>{t('finance.ai.draft.contactLabel')}</label
				>
				<input
					id={fieldId('contact-label')}
					class={fieldClass}
					disabled={saved}
					value={draft.contact_label ?? ''}
					oninput={(e) => onchange({ contact_label: e.currentTarget.value || null })}
				/>
			{/if}
		</div>

		<div class="sm:col-span-2">
			<label class={labelClass} for={fieldId('desc')}>{t('finance.ai.draft.description')}</label>
			<textarea
				id={fieldId('desc')}
				class={textareaClass}
				rows={3}
				disabled={saved}
				value={draft.description ?? ''}
				oninput={(e) => onchange({ description: e.currentTarget.value || null })}></textarea>
		</div>
	</div>

	{#if createError}
		<p class="mt-3 text-sm text-danger">{createError}</p>
	{/if}
	{#if draft._status === 'error' && draft._error}
		<p class="mt-3 text-sm text-danger">{draft._error}</p>
	{/if}
</div>

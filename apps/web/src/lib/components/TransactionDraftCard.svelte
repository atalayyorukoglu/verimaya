<script lang="ts">
	import type { Patient, TransactionDraft, TransactionStatus } from '@verimaya/shared';
	import { transactionKindLabels, transactionStatusLabels } from '@verimaya/shared';
	import { fieldClass, labelClass, textareaClass } from '$lib/api';
	import { formatMoney } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	export type DraftApprovalState = TransactionDraft & {
		status: TransactionStatus | null;
		paid_amount: number | null;
		fx_rate: number | null;
		amount_base: number | null;
		_status: 'idle' | 'saving' | 'saved' | 'error';
		_error: string | null;
	};

	let {
		draft,
		patients = [],
		baseCurrency = 'TRY',
		onchange
	}: {
		draft: DraftApprovalState;
		patients?: Patient[];
		baseCurrency?: string;
		onchange: (patch: Partial<DraftApprovalState>) => void;
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
			<label class={labelClass} for="draft-kind">{t('finance.ai.draft.kind')}</label>
			<select
				id="draft-kind"
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
			<label class={labelClass} for="draft-amount">{t('finance.ai.draft.amount')}</label>
			<input
				id="draft-amount"
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
			<label class={labelClass} for="draft-currency">{t('finance.ai.draft.currency')}</label>
			<select
				id="draft-currency"
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
			<label class={labelClass} for="draft-date">{t('finance.ai.draft.date')}</label>
			<input
				id="draft-date"
				class={fieldClass}
				type="date"
				disabled={saved}
				value={draft.occurred_on}
				onchange={(e) => onchange({ occurred_on: e.currentTarget.value })}
			/>
		</div>

		<div class="sm:col-span-2">
			<label class={labelClass} for="draft-title">{t('finance.ai.draft.title')}</label>
			<input
				id="draft-title"
				class={fieldClass}
				disabled={saved}
				value={draft.title}
				oninput={(e) => onchange({ title: e.currentTarget.value })}
			/>
		</div>

		<div>
			<label class={labelClass} for="draft-category">{t('finance.ai.draft.category')}</label>
			<input
				id="draft-category"
				class={fieldClass}
				disabled={saved}
				value={draft.category ?? ''}
				oninput={(e) => onchange({ category: e.currentTarget.value || null })}
			/>
		</div>

		<div>
			<label class={labelClass} for="draft-method">{t('finance.ai.draft.paymentMethod')}</label>
			<input
				id="draft-method"
				class={fieldClass}
				disabled={saved}
				value={draft.payment_method ?? ''}
				oninput={(e) => onchange({ payment_method: e.currentTarget.value || null })}
			/>
		</div>

		<div>
			<label class={labelClass} for="draft-status">{t('finance.ai.draft.status')}</label>
			<select
				id="draft-status"
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
			<label class={labelClass} for="draft-paid">{t('finance.ai.draft.paidAmount')}</label>
			<input
				id="draft-paid"
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
			<label class={labelClass} for="draft-fx">{t('finance.ai.draft.fxRate')}</label>
			<input
				id="draft-fx"
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
			<label class={labelClass} for="draft-base">{t('finance.ai.draft.amountBase')}</label>
			<input
				id="draft-base"
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
			<label class={labelClass} for="draft-patient">{t('finance.ai.draft.patient')}</label>
			<select
				id="draft-patient"
				class={fieldClass}
				disabled={saved}
				value={draft.patient_id ?? ''}
				onchange={(e) => {
					const id = e.currentTarget.value || null;
					const patient = patients.find((p) => p.id === id);
					onchange({
						patient_id: id,
						patient_display_name: patient?.full_name ?? null
					});
				}}
			>
				<option value="">{t('finance.ai.draft.patientNone')}</option>
				{#each patients as p (p.id)}
					<option value={p.id}>{p.full_name}</option>
				{/each}
			</select>
		</div>

		<div>
			<label class={labelClass} for="draft-contact">{t('finance.ai.draft.contact')}</label>
			<input
				id="draft-contact"
				class={fieldClass}
				disabled={saved}
				value={draft.contact_label ?? ''}
				oninput={(e) => onchange({ contact_label: e.currentTarget.value || null })}
			/>
		</div>

		<div class="sm:col-span-2">
			<label class={labelClass} for="draft-desc">{t('finance.ai.draft.description')}</label>
			<textarea
				id="draft-desc"
				class={textareaClass}
				rows={3}
				disabled={saved}
				value={draft.description ?? ''}
				oninput={(e) => onchange({ description: e.currentTarget.value || null })}></textarea>
		</div>
	</div>

	{#if draft._status === 'error' && draft._error}
		<p class="mt-3 text-sm text-danger">{draft._error}</p>
	{/if}
</div>

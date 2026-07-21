<script lang="ts">
	import type { Patient, TransactionDraft } from '@verimaya/shared';
	import { transactionKindLabels } from '@verimaya/shared';
	import { fieldClass, labelClass, textareaClass } from '$lib/api';
	import { formatMoney } from '$lib/format';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';

	type DraftState = TransactionDraft & {
		_status: 'idle' | 'saving' | 'saved' | 'error';
		_error: string | null;
	};

	let {
		draft,
		patients = [],
		saving = false,
		onchange,
		onsave
	}: {
		draft: DraftState;
		patients?: Patient[];
		saving?: boolean;
		onchange: (patch: Partial<TransactionDraft>) => void;
		onsave: () => void | Promise<void>;
	} = $props();

	const kinds = Object.keys(transactionKindLabels) as TransactionDraft['kind'][];
	const currencies = ['TRY', 'GBP', 'USD', 'EUR'] as const;

	const amountMajor = $derived(String(draft.amount / 100));
	const saved = $derived(draft._status === 'saved');
	const cardSaving = $derived(draft._status === 'saving' || saving);

	function onAmountInput(value: string) {
		const n = Number.parseFloat(value.replace(',', '.'));
		if (Number.isFinite(n) && n > 0) onchange({ amount: Math.round(n * 100) });
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
			<span class="text-xs font-medium text-success">Kaydedildi</span>
		{/if}
	</div>

	<div class="grid gap-3 sm:grid-cols-2">
		<div>
			<label class={labelClass}>Tür</label>
			<select
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
			<label class={labelClass}>Tutar</label>
			<input
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
			<label class={labelClass}>Para birimi</label>
			<select
				class={fieldClass}
				disabled={saved}
				value={draft.currency}
				onchange={(e) =>
					onchange({
						currency: e.currentTarget.value as (typeof currencies)[number]
					})}
			>
				{#each currencies as c (c)}
					<option value={c}>{c}</option>
				{/each}
			</select>
		</div>

		<div>
			<label class={labelClass}>Tarih</label>
			<input
				class={fieldClass}
				type="date"
				disabled={saved}
				value={draft.occurred_on}
				onchange={(e) => onchange({ occurred_on: e.currentTarget.value })}
			/>
		</div>

		<div class="sm:col-span-2">
			<label class={labelClass}>Başlık</label>
			<input
				class={fieldClass}
				disabled={saved}
				value={draft.title}
				oninput={(e) => onchange({ title: e.currentTarget.value })}
			/>
		</div>

		<div>
			<label class={labelClass}>Kategori</label>
			<input
				class={fieldClass}
				disabled={saved}
				value={draft.category ?? ''}
				oninput={(e) => onchange({ category: e.currentTarget.value || null })}
			/>
		</div>

		<div>
			<label class={labelClass}>Ödeme yöntemi</label>
			<input
				class={fieldClass}
				disabled={saved}
				value={draft.payment_method ?? ''}
				oninput={(e) => onchange({ payment_method: e.currentTarget.value || null })}
			/>
		</div>

		<div>
			<label class={labelClass}>Hasta</label>
			<select
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
				<option value="">— Seçiniz —</option>
				{#each patients as p (p.id)}
					<option value={p.id}>{p.full_name}</option>
				{/each}
			</select>
		</div>

		<div>
			<label class={labelClass}>Kişi / firma</label>
			<input
				class={fieldClass}
				disabled={saved}
				value={draft.contact_label ?? ''}
				oninput={(e) => onchange({ contact_label: e.currentTarget.value || null })}
			/>
		</div>

		<div class="sm:col-span-2">
			<label class={labelClass}>Açıklama (orijinal mesaj)</label>
			<textarea
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

	{#if !saved}
		<div class="mt-4 flex justify-end">
			<Button type="button" disabled={cardSaving} onclick={() => onsave()}>
				{cardSaving ? 'Kaydediliyor…' : 'Kaydet'}
			</Button>
		</div>
	{/if}
</div>

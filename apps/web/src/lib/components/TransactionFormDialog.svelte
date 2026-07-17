<script lang="ts">
	import type {
		Patient,
		Transaction,
		TransactionCreate,
		TransactionKind,
		TransactionStatus,
		TransactionUpdate
	} from '@verimaya/shared';
	import { transactionKindLabels, transactionStatusLabels } from '@verimaya/shared';
	import { fieldClass, labelClass, textareaClass } from '$lib/api';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		open = $bindable(false),
		transaction = null,
		patients = [],
		saving = false,
		error = null,
		onsubmit
	}: {
		open?: boolean;
		transaction?: Transaction | null;
		patients?: Patient[];
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: TransactionCreate | TransactionUpdate) => void | Promise<void>;
	} = $props();

	const kinds = Object.keys(transactionKindLabels) as TransactionKind[];
	const statuses = Object.keys(transactionStatusLabels) as TransactionStatus[];

	let kind = $state<TransactionKind>('income');
	let title = $state('');
	let category = $state('');
	let occurred_on = $state('');
	let status = $state<TransactionStatus>('unpaid');
	let amountMajor = $state('');
	let patient_id = $state('');
	let payment_method = $state('');
	let description = $state('');

	$effect(() => {
		if (!open) return;
		kind = transaction?.kind ?? 'income';
		title = transaction?.title ?? '';
		category = transaction?.category ?? '';
		occurred_on = transaction?.occurred_on ?? new Date().toISOString().slice(0, 10);
		status = transaction?.status ?? 'unpaid';
		amountMajor = transaction ? String(transaction.amount / 100) : '';
		patient_id = transaction?.patient_id ?? '';
		payment_method = transaction?.payment_method ?? '';
		description = transaction?.description ?? '';
	});

	const isEdit = $derived(!!transaction);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		const amount = Math.round(Number.parseFloat(amountMajor.replace(',', '.')) * 100);
		if (!Number.isFinite(amount) || amount <= 0) return;
		const payload = {
			kind,
			title: title.trim(),
			subtitle: null,
			category: category.trim() || null,
			occurred_on,
			status,
			invoice_status: transaction?.invoice_status ?? ('none' as const),
			payment_method: payment_method.trim() || null,
			amount,
			paid_amount:
				status === 'paid' ? amount : status === 'partial' ? Math.floor(amount / 2) : null,
			currency: 'TRY' as const,
			patient_id: patient_id || null,
			contact_label: null,
			description: description.trim() || null
		};
		await onsubmit(payload);
	}
</script>

<Dialog
	bind:open
	title={isEdit ? 'İşlemi düzenle' : 'Yeni işlem'}
	description="Tutar TL cinsinden girilir; API’ye kuruş olarak gider."
>
	<form id="tx-form" class="space-y-3" onsubmit={handleSubmit}>
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="tx-kind">Tür</label>
				<select id="tx-kind" class={fieldClass} bind:value={kind}>
					{#each kinds as k (k)}
						<option value={k}>{transactionKindLabels[k]}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class={labelClass} for="tx-status">Durum</label>
				<select id="tx-status" class={fieldClass} bind:value={status}>
					{#each statuses as s (s)}
						<option value={s}>{transactionStatusLabels[s]}</option>
					{/each}
				</select>
			</div>
		</div>
		<div>
			<label class={labelClass} for="tx-title">Başlık</label>
			<input id="tx-title" class={fieldClass} bind:value={title} required maxlength={255} />
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="tx-amount">Tutar (₺)</label>
				<input
					id="tx-amount"
					class={fieldClass}
					bind:value={amountMajor}
					inputmode="decimal"
					required
					placeholder="0,00"
				/>
			</div>
			<div>
				<label class={labelClass} for="tx-date">Tarih</label>
				<input id="tx-date" class={fieldClass} type="date" bind:value={occurred_on} required />
			</div>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="tx-category">Kategori</label>
				<input id="tx-category" class={fieldClass} bind:value={category} maxlength={128} />
			</div>
			<div>
				<label class={labelClass} for="tx-method">Ödeme yöntemi</label>
				<input id="tx-method" class={fieldClass} bind:value={payment_method} maxlength={64} />
			</div>
		</div>
		<div>
			<label class={labelClass} for="tx-patient">Hasta (opsiyonel)</label>
			<select id="tx-patient" class={fieldClass} bind:value={patient_id}>
				<option value="">—</option>
				{#each patients as p (p.id)}
					<option value={p.id}>{p.full_name}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class={labelClass} for="tx-desc">Açıklama</label>
			<textarea id="tx-desc" class={textareaClass} bind:value={description} maxlength={8000}
			></textarea>
		</div>
		{#if error}
			<p class="text-sm text-danger">{error}</p>
		{/if}
	</form>
	{#snippet footer()}
		<Button variant="ghost" type="button" onclick={() => (open = false)} disabled={saving}
			>İptal</Button
		>
		<Button type="submit" form="tx-form" disabled={saving || !title.trim() || !amountMajor}>
			{saving ? 'Kaydediliyor…' : isEdit ? 'Kaydet' : 'Oluştur'}
		</Button>
	{/snippet}
</Dialog>

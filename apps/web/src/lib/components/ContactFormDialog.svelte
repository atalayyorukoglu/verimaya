<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { Contact, ContactCreate, ContactType, ContactUpdate } from '@verimaya/shared';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass, textareaClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import { type DeleteConfirmPhase, runConfirmedDelete } from '$lib/components/delete-confirm-flow';

	let {
		open = $bindable(false),
		contact = null,
		saving = false,
		error = null,
		onsubmit,
		ondelete
	}: {
		open?: boolean;
		contact?: Contact | null;
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: ContactCreate | ContactUpdate) => void | Promise<void>;
		ondelete?: () => void | Promise<void>;
	} = $props();

	const qs = useQueryScope();

	const typesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.contactTypes(),
		queryFn: () => apiGet<{ items: ContactType[] }>(apiPaths.settingsContactTypes),
		enabled: open && qs.ready
	}));

	let contact_type_id = $state('');
	let display_name = $state('');
	let phone = $state('');
	let email = $state('');
	let notes = $state('');
	let is_internal = $state(false);
	let deletePhase = $state<DeleteConfirmPhase>('form');

	$effect(() => {
		if (!open) {
			deletePhase = 'form';
			return;
		}
		const types = typesQuery.data?.items ?? [];
		contact_type_id = contact?.contact_type_id ?? types[0]?.id ?? '';
		display_name = contact?.display_name ?? '';
		phone = contact?.phone ?? '';
		email = contact?.email ?? '';
		notes = contact?.notes ?? '';
		is_internal = contact?.is_internal ?? false;
		deletePhase = 'form';
	});

	const isEdit = $derived(!!contact);
	const confirmingDelete = $derived(deletePhase === 'confirm');

	const deleteDetail = $derived.by(() => {
		if (!contact) return '';
		return `${contact.display_name} · ${contact.contact_type_name}`;
	});

	const dialogTitle = $derived(
		confirmingDelete ? t('contacts.deleteConfirmTitle') : isEdit ? 'Kişiyi düzenle' : 'Yeni kişi'
	);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (confirmingDelete) return;
		if (!contact_type_id || !display_name.trim()) return;
		await onsubmit({
			contact_type_id,
			display_name: display_name.trim(),
			phone: phone.trim() || null,
			email: email.trim() || null,
			notes: notes.trim() || null,
			is_internal
		});
	}

	function requestDelete() {
		deletePhase = 'confirm';
	}

	function cancelDelete() {
		deletePhase = 'form';
	}

	async function confirmDelete() {
		if (!ondelete) return;
		await runConfirmedDelete(deletePhase, () => Promise.resolve(ondelete()));
	}
</script>

<Dialog
	bind:open
	title={dialogTitle}
	description={confirmingDelete
		? undefined
		: 'Otel, klinik, transfer veya hasta dizini. Tip “Hasta” ise otomatik hasta kaydı açılır.'}
>
	{#if confirmingDelete}
		<div class="space-y-3">
			<p class="text-sm text-text">{t('contacts.deleteConfirmBody')}</p>
			<p
				class="rounded-[6px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-text"
			>
				{deleteDetail}
			</p>
			{#if error}
				<p class="text-sm text-danger">{error}</p>
			{/if}
		</div>
	{:else}
		<form id="contact-form" class="space-y-3" onsubmit={handleSubmit}>
			<div>
				<label class={labelClass} for="c-name">Ad / ünvan</label>
				<input id="c-name" class={fieldClass} bind:value={display_name} required maxlength={255} />
			</div>
			<div>
				<label class={labelClass} for="c-type">Tür</label>
				<select id="c-type" class={fieldClass} bind:value={contact_type_id} required>
					{#each typesQuery.data?.items ?? [] as t (t.id)}
						<option value={t.id}>{t.name}</option>
					{/each}
				</select>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class={labelClass} for="c-phone">Telefon</label>
					<input id="c-phone" class={fieldClass} bind:value={phone} maxlength={64} />
				</div>
				<div>
					<label class={labelClass} for="c-email">E-posta</label>
					<input id="c-email" class={fieldClass} type="email" bind:value={email} maxlength={255} />
				</div>
			</div>
			<label class="flex items-center gap-2 text-sm text-text">
				<input type="checkbox" bind:checked={is_internal} class="size-4 rounded border-border" />
				İç personel
			</label>
			<div>
				<label class={labelClass} for="c-notes">Notlar</label>
				<textarea id="c-notes" class={textareaClass} bind:value={notes} maxlength={8000}></textarea>
			</div>
			{#if error}
				<p class="text-sm text-danger">{error}</p>
			{/if}
		</form>
	{/if}
	{#snippet footer()}
		{#if confirmingDelete}
			<Button variant="ghost" type="button" onclick={cancelDelete} disabled={saving}>
				{t('contacts.deleteBack')}
			</Button>
			<Button
				variant="destructive"
				type="button"
				onclick={confirmDelete}
				disabled={saving || !ondelete}
			>
				{saving ? t('contacts.deleting') : t('contacts.deleteConfirmAction')}
			</Button>
		{:else}
			{#if isEdit && ondelete}
				<Button
					variant="outline"
					type="button"
					class="mr-auto text-danger hover:bg-danger/10 hover:text-danger"
					onclick={requestDelete}
					disabled={saving}
				>
					{t('contacts.delete')}
				</Button>
			{/if}
			<Button variant="ghost" type="button" onclick={() => (open = false)} disabled={saving}
				>İptal</Button
			>
			<Button
				type="submit"
				form="contact-form"
				disabled={saving || !display_name.trim() || !contact_type_id}
			>
				{saving ? 'Kaydediliyor…' : isEdit ? 'Kaydet' : 'Oluştur'}
			</Button>
		{/if}
	{/snippet}
</Dialog>

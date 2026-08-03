<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { Contact, ContactCreate, ContactType, ContactUpdate } from '@verimaya/shared';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass, textareaClass } from '$lib/api';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		open = $bindable(false),
		contact = null,
		saving = false,
		error = null,
		onsubmit
	}: {
		open?: boolean;
		contact?: Contact | null;
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: ContactCreate | ContactUpdate) => void | Promise<void>;
	} = $props();

	const typesQuery = createQuery(() => ({
		queryKey: ['settings', 'contact-types'],
		queryFn: () => apiGet<{ items: ContactType[] }>(apiPaths.settingsContactTypes),
		enabled: open
	}));

	let contact_type_id = $state('');
	let display_name = $state('');
	let phone = $state('');
	let email = $state('');
	let notes = $state('');
	let is_internal = $state(false);

	$effect(() => {
		if (!open) return;
		const types = typesQuery.data?.items ?? [];
		contact_type_id = contact?.contact_type_id ?? types[0]?.id ?? '';
		display_name = contact?.display_name ?? '';
		phone = contact?.phone ?? '';
		email = contact?.email ?? '';
		notes = contact?.notes ?? '';
		is_internal = contact?.is_internal ?? false;
	});

	const isEdit = $derived(!!contact);

	async function handleSubmit(e: Event) {
		e.preventDefault();
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
</script>

<Dialog
	bind:open
	title={isEdit ? 'Kişiyi düzenle' : 'Yeni kişi'}
	description="Otel, klinik, transfer veya hasta dizini. Tip “Hasta” ise otomatik hasta kaydı açılır."
>
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
	{#snippet footer()}
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
	{/snippet}
</Dialog>

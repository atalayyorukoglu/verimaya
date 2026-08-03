<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type {
		Appointment,
		AppointmentCreate,
		AppointmentStatus,
		AppointmentTypeSetting,
		AppointmentUpdate,
		Contact,
		Patient
	} from '@verimaya/shared';
	import { apiPaths, appointmentStatusLabels } from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass, listUrl, textareaClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		open = $bindable(false),
		appointment = null,
		patients = [],
		defaultPatientId = null,
		saving = false,
		error = null,
		onsubmit
	}: {
		open?: boolean;
		appointment?: Appointment | null;
		patients?: Patient[];
		defaultPatientId?: string | null;
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: AppointmentCreate | AppointmentUpdate) => void | Promise<void>;
	} = $props();

	const statuses = Object.keys(appointmentStatusLabels) as AppointmentStatus[];
	const { keys, ready } = useQueryScope();

	const typesQuery = createQuery(() => ({
		queryKey: keys.settings.appointmentTypes(),
		queryFn: () => apiGet<{ items: AppointmentTypeSetting[] }>(apiPaths.settingsAppointmentTypes),
		enabled: open && ready
	}));

	const contactsQuery = createQuery(() => ({
		queryKey: keys.contacts.list({ limit: 100, for: 'appt-form' }),
		queryFn: () =>
			apiGet<{ items: Contact[]; next_cursor: string | null }>(listUrl('contacts', { limit: 100 })),
		enabled: open && ready
	}));

	const typeNames = $derived(
		[...(typesQuery.data?.items ?? [])]
			.sort((a, b) => a.sort_order - b.sort_order)
			.map((t) => t.name)
	);

	const contacts = $derived(contactsQuery.data?.items ?? []);
	const clinicContacts = $derived(contacts.filter((c) => c.contact_type_name === 'Klinik'));
	const hotelContacts = $derived(contacts.filter((c) => c.contact_type_name === 'Otel'));
	const transferContacts = $derived(contacts.filter((c) => c.contact_type_name === 'Transfer'));

	let patient_id = $state('');
	let title = $state('');
	let appointment_type = $state('Konsültasyon');
	let status = $state<AppointmentStatus>('scheduled');
	let startsLocal = $state('');
	let endsLocal = $state('');
	let clinic_contact_id = $state('');
	let hotel_contact_id = $state('');
	let transfer_contact_id = $state('');
	let transfer_note = $state('');
	let notes = $state('');

	function toLocalInput(iso: string | null | undefined): string {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function fromLocalInput(value: string): string {
		return new Date(value).toISOString();
	}

	$effect(() => {
		if (!open) return;
		patient_id = appointment?.patient_id ?? defaultPatientId ?? patients[0]?.id ?? '';
		title = appointment?.title ?? '';
		appointment_type = appointment?.appointment_type ?? typeNames[0] ?? 'Konsültasyon';
		status = appointment?.status ?? 'scheduled';
		startsLocal = appointment
			? toLocalInput(appointment.starts_at)
			: toLocalInput(new Date(Date.now() + 3600_000).toISOString());
		endsLocal = appointment?.ends_at
			? toLocalInput(appointment.ends_at)
			: toLocalInput(new Date(Date.now() + 5400_000).toISOString());
		clinic_contact_id = appointment?.clinic_contact_id ?? '';
		hotel_contact_id = appointment?.hotel_contact_id ?? '';
		transfer_contact_id = appointment?.transfer_contact_id ?? '';
		transfer_note = appointment?.transfer_note ?? '';
		notes = appointment?.notes ?? '';
	});

	const isEdit = $derived(!!appointment);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!patient_id || !startsLocal) return;
		const clinic = contacts.find((c) => c.id === clinic_contact_id);
		const hotel = contacts.find((c) => c.id === hotel_contact_id);
		const payload = {
			patient_id,
			title: title.trim() || null,
			appointment_type: appointment_type.trim() || null,
			status,
			starts_at: fromLocalInput(startsLocal),
			ends_at: endsLocal ? fromLocalInput(endsLocal) : null,
			clinic_contact_id: clinic_contact_id || null,
			hotel_contact_id: hotel_contact_id || null,
			transfer_contact_id: transfer_contact_id || null,
			clinic_name: clinic?.display_name ?? null,
			hotel_name: hotel?.display_name ?? null,
			transfer_note: transfer_note.trim() || null,
			notes: notes.trim() || null
		};
		await onsubmit(payload);
	}
</script>

<Dialog
	bind:open
	title={isEdit ? 'Randevuyu düzenle' : 'Yeni randevu'}
	description="Hasta seçimi ve tarih zorunlu. Klinik / otel / transfer kişilerden seçilir."
>
	<form id="appointment-form" class="space-y-3" onsubmit={handleSubmit}>
		<div>
			<label class={labelClass} for="appt-patient">Hasta</label>
			<select id="appt-patient" class={fieldClass} bind:value={patient_id} required>
				{#if patients.length === 0}
					<option value="">Hasta yok — önce hasta ekleyin</option>
				{:else}
					{#each patients as p (p.id)}
						<option value={p.id}>{p.full_name}</option>
					{/each}
				{/if}
			</select>
		</div>
		<div>
			<label class={labelClass} for="appt-title">Başlık</label>
			<input id="appt-title" class={fieldClass} bind:value={title} maxlength={255} />
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="appt-type">Tür</label>
				{#if typeNames.length > 0}
					<select id="appt-type" class={fieldClass} bind:value={appointment_type}>
						{#each typeNames as t (t)}
							<option value={t}>{t}</option>
						{/each}
					</select>
				{:else}
					<input id="appt-type" class={fieldClass} bind:value={appointment_type} maxlength={128} />
				{/if}
			</div>
			<div>
				<label class={labelClass} for="appt-status">Durum</label>
				<select id="appt-status" class={fieldClass} bind:value={status}>
					{#each statuses as s (s)}
						<option value={s}>{appointmentStatusLabels[s]}</option>
					{/each}
				</select>
			</div>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="appt-start">Başlangıç</label>
				<input
					id="appt-start"
					class={fieldClass}
					type="datetime-local"
					bind:value={startsLocal}
					required
				/>
			</div>
			<div>
				<label class={labelClass} for="appt-end">Bitiş</label>
				<input id="appt-end" class={fieldClass} type="datetime-local" bind:value={endsLocal} />
			</div>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="appt-clinic">Klinik</label>
				<select id="appt-clinic" class={fieldClass} bind:value={clinic_contact_id}>
					<option value="">—</option>
					{#each clinicContacts.length ? clinicContacts : contacts as c (c.id)}
						<option value={c.id}>{c.display_name}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class={labelClass} for="appt-hotel">Otel</label>
				<select id="appt-hotel" class={fieldClass} bind:value={hotel_contact_id}>
					<option value="">—</option>
					{#each hotelContacts.length ? hotelContacts : contacts as c (c.id)}
						<option value={c.id}>{c.display_name}</option>
					{/each}
				</select>
			</div>
		</div>
		<div>
			<label class={labelClass} for="appt-transfer-c">Transfer firması</label>
			<select id="appt-transfer-c" class={fieldClass} bind:value={transfer_contact_id}>
				<option value="">—</option>
				{#each transferContacts.length ? transferContacts : contacts as c (c.id)}
					<option value={c.id}>{c.display_name}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class={labelClass} for="appt-transfer">Transfer notu</label>
			<input id="appt-transfer" class={fieldClass} bind:value={transfer_note} maxlength={8000} />
		</div>
		<div>
			<label class={labelClass} for="appt-notes">Notlar</label>
			<textarea id="appt-notes" class={textareaClass} bind:value={notes} maxlength={8000}
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
		<Button type="submit" form="appointment-form" disabled={saving || !patient_id || !startsLocal}>
			{saving ? 'Kaydediliyor…' : isEdit ? 'Kaydet' : 'Oluştur'}
		</Button>
	{/snippet}
</Dialog>

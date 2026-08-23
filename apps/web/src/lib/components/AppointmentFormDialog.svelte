<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type {
		Appointment,
		AppointmentCreate,
		AppointmentStatus,
		AppointmentTypeSetting,
		AppointmentUpdate,
		Contact
	} from '@verimaya/shared';
	import { apiPaths, appointmentStatusLabels } from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass, listUrl, textareaClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import { formatDateTime } from '$lib/format';
	import {
		contactInfoMissingKind,
		contactInfoWarningMessageKey
	} from '$lib/appointment-contact-info';
	import { type DeleteConfirmPhase, runConfirmedDelete } from '$lib/components/delete-confirm-flow';

	let {
		open = $bindable(false),
		appointment = null,
		contacts = [],
		defaultContactId = null,
		saving = false,
		error = null,
		onsubmit,
		ondelete
	}: {
		open?: boolean;
		appointment?: Appointment | null;
		contacts?: Contact[];
		defaultContactId?: string | null;
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: AppointmentCreate | AppointmentUpdate) => void | Promise<void>;
		ondelete?: () => void | Promise<void>;
	} = $props();

	const statuses = Object.keys(appointmentStatusLabels) as AppointmentStatus[];
	const qs = useQueryScope();

	const typesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.appointmentTypes(),
		queryFn: () => apiGet<{ items: AppointmentTypeSetting[] }>(apiPaths.settingsAppointmentTypes),
		enabled: open && qs.ready
	}));

	const directoryQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.list({ limit: 100, for: 'appt-form' }),
		queryFn: () =>
			apiGet<{ items: Contact[]; next_cursor: string | null }>(listUrl('contacts', { limit: 100 })),
		enabled: open && qs.ready
	}));

	const typeNames = $derived(
		[...(typesQuery.data?.items ?? [])]
			.sort((a, b) => a.sort_order - b.sort_order)
			.map((t) => t.name)
	);

	const directoryContacts = $derived(directoryQuery.data?.items ?? []);

	function sortByDisplayName(list: Contact[]) {
		return [...list].sort((a, b) => a.display_name.localeCompare(b.display_name, 'tr'));
	}

	function findContactById(id: string): Contact | undefined {
		return directoryContacts.find((c) => c.id === id) ?? contacts.find((c) => c.id === id);
	}

	const patientContacts = $derived(
		sortByDisplayName(directoryContacts.filter((c) => c.contact_type_name === 'Hasta'))
	);
	const clinicContacts = $derived(
		sortByDisplayName(directoryContacts.filter((c) => c.contact_type_name === 'Klinik'))
	);
	const hotelContacts = $derived(
		sortByDisplayName(directoryContacts.filter((c) => c.contact_type_name === 'Otel'))
	);
	const transferContacts = $derived(
		sortByDisplayName(directoryContacts.filter((c) => c.contact_type_name === 'Transfer'))
	);

	/**
	 * Hekim seçici — BİLEREK ünvana göre filtrelenmiyor. `contact_titles` tenant'ın
	 * yönettiği bir sözlük: tenant "Hekim"i "Doktor" diye yeniden adlandırırsa (veya
	 * silip yeniden yazarsa) bir isim filtresi sessizce boşalır ve seçici hekimsiz
	 * görünür. Bunun yerine tüm kişiler listelenir, ünvan satırda yanında gösterilir
	 * ("Ahmet Yılmaz · Hekim"), kullanıcı arayarak seçer. Ünvanı olanlar listede önce
	 * gelir — bu bir sıralama ipucu, filtre değil (bkz. AGENTS.md: ünvan izne girmez,
	 * burada da yalnız görüntüleme sırası için okunuyor).
	 */
	function doctorLabel(c: Contact): string {
		return c.title_name ? t('appointments.form.doctorTitleSuffix', { name: c.display_name, title: c.title_name }) : c.display_name;
	}
	const doctorContacts = $derived(
		[...directoryContacts].sort((a, b) => {
			const titled = Number(!!b.title_name) - Number(!!a.title_name);
			if (titled !== 0) return titled;
			return a.display_name.localeCompare(b.display_name, 'tr');
		})
	);

	let contact_id = $state('');
	let title = $state('');
	let appointment_type = $state('Konsültasyon');
	let status = $state<AppointmentStatus>('scheduled');
	let startsLocal = $state('');
	let endsLocal = $state('');
	let clinic_contact_id = $state('');
	let hotel_contact_id = $state('');
	let transfer_contact_id = $state('');
	let doctor_contact_id = $state('');
	let transfer_note = $state('');
	let notes = $state('');
	let deletePhase = $state<DeleteConfirmPhase>('form');

	const orphanPatientContact = $derived.by((): Pick<Contact, 'id' | 'display_name'> | undefined => {
		if (!contact_id || patientContacts.some((c) => c.id === contact_id)) return undefined;
		return findContactById(contact_id) ?? { id: contact_id, display_name: contact_id };
	});
	const orphanClinicContact = $derived.by((): Pick<Contact, 'id' | 'display_name'> | undefined => {
		if (!clinic_contact_id || clinicContacts.some((c) => c.id === clinic_contact_id))
			return undefined;
		return (
			findContactById(clinic_contact_id) ?? {
				id: clinic_contact_id,
				display_name: clinic_contact_id
			}
		);
	});
	const orphanHotelContact = $derived.by((): Pick<Contact, 'id' | 'display_name'> | undefined => {
		if (!hotel_contact_id || hotelContacts.some((c) => c.id === hotel_contact_id)) return undefined;
		return (
			findContactById(hotel_contact_id) ?? {
				id: hotel_contact_id,
				display_name: hotel_contact_id
			}
		);
	});
	const orphanTransferContact = $derived.by(
		(): Pick<Contact, 'id' | 'display_name'> | undefined => {
			if (!transfer_contact_id || transferContacts.some((c) => c.id === transfer_contact_id))
				return undefined;
			return (
				findContactById(transfer_contact_id) ?? {
					id: transfer_contact_id,
					display_name: transfer_contact_id
				}
			);
		}
	);
	const orphanDoctorContact = $derived.by((): Contact | undefined => {
		if (!doctor_contact_id || doctorContacts.some((c) => c.id === doctor_contact_id))
			return undefined;
		return findContactById(doctor_contact_id);
	});

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
		if (!open) {
			deletePhase = 'form';
			return;
		}
		contact_id = appointment?.contact_id ?? defaultContactId ?? contacts[0]?.id ?? '';
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
		doctor_contact_id = appointment?.doctor_contact_id ?? '';
		transfer_note = appointment?.transfer_note ?? '';
		notes = appointment?.notes ?? '';
		deletePhase = 'form';
	});

	const isEdit = $derived(!!appointment);
	const confirmingDelete = $derived(deletePhase === 'confirm');

	const deleteDetail = $derived.by(() => {
		if (!appointment) return '';
		const contactName = appointment.contact_display_name ?? '—';
		return `${contactName} · ${formatDateTime(appointment.starts_at)}`;
	});

	const dialogTitle = $derived(
		confirmingDelete
			? t('appointments.deleteConfirmTitle')
			: isEdit
				? t('appointments.form.editTitle')
				: t('appointments.form.createTitle')
	);

	const selectedContact = $derived(contact_id ? findContactById(contact_id) : undefined);
	const contactInfoWarningKey = $derived(
		contactInfoWarningMessageKey(contactInfoMissingKind(selectedContact))
	);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (confirmingDelete) return;
		if (!contact_id || !startsLocal) return;
		const clinic = directoryContacts.find((c) => c.id === clinic_contact_id);
		const hotel = directoryContacts.find((c) => c.id === hotel_contact_id);
		const payload = {
			contact_id,
			title: title.trim() || null,
			appointment_type: appointment_type.trim() || null,
			status,
			starts_at: fromLocalInput(startsLocal),
			ends_at: endsLocal ? fromLocalInput(endsLocal) : null,
			clinic_contact_id: clinic_contact_id || null,
			hotel_contact_id: hotel_contact_id || null,
			transfer_contact_id: transfer_contact_id || null,
			doctor_contact_id: doctor_contact_id || null,
			clinic_name: clinic?.display_name ?? null,
			hotel_name: hotel?.display_name ?? null,
			transfer_note: transfer_note.trim() || null,
			notes: notes.trim() || null
		};
		await onsubmit(payload);
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
	description={confirmingDelete ? undefined : t('appointments.form.description')}
>
	{#if confirmingDelete}
		<div class="space-y-3">
			<p class="text-sm text-text">{t('appointments.deleteConfirmBody')}</p>
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
		<form id="appointment-form" class="space-y-3" onsubmit={handleSubmit}>
			<div>
				<label class={labelClass} for="appt-contact">{t('appointments.form.contact')}</label>
				<select id="appt-contact" class={fieldClass} bind:value={contact_id} required>
					{#if patientContacts.length === 0 && !orphanPatientContact}
						<option value="">{t('appointments.form.noContacts')}</option>
					{:else}
						{#if orphanPatientContact}
							<option value={orphanPatientContact.id}>{orphanPatientContact.display_name}</option>
						{/if}
						{#each patientContacts as c (c.id)}
							<option value={c.id}>{c.display_name}</option>
						{/each}
					{/if}
				</select>
				{#if contactInfoWarningKey}
					<p
						class="mt-2 rounded-[6px] border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
						role="status"
						data-testid="appt-contact-info-warning"
					>
						{t(contactInfoWarningKey)}
					</p>
				{/if}
			</div>
			<div>
				<label class={labelClass} for="appt-title">{t('appointments.form.title')}</label>
				<input id="appt-title" class={fieldClass} bind:value={title} maxlength={255} />
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class={labelClass} for="appt-type">{t('appointments.form.type')}</label>
					{#if typeNames.length > 0}
						<select id="appt-type" class={fieldClass} bind:value={appointment_type}>
							{#each typeNames as typeName (typeName)}
								<option value={typeName}>{typeName}</option>
							{/each}
						</select>
					{:else}
						<input
							id="appt-type"
							class={fieldClass}
							bind:value={appointment_type}
							maxlength={128}
						/>
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
					<label class={labelClass} for="appt-start">{t('appointments.form.start')}</label>
					<input
						id="appt-start"
						class={fieldClass}
						type="datetime-local"
						bind:value={startsLocal}
						required
					/>
				</div>
				<div>
					<label class={labelClass} for="appt-end">{t('appointments.form.end')}</label>
					<input id="appt-end" class={fieldClass} type="datetime-local" bind:value={endsLocal} />
				</div>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class={labelClass} for="appt-clinic">Klinik</label>
					<select id="appt-clinic" class={fieldClass} bind:value={clinic_contact_id}>
						<option value="">—</option>
						{#if orphanClinicContact}
							<option value={orphanClinicContact.id}>{orphanClinicContact.display_name}</option>
						{/if}
						{#each clinicContacts as c (c.id)}
							<option value={c.id}>{c.display_name}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class={labelClass} for="appt-doctor">{t('appointments.form.doctor')}</label>
					<select id="appt-doctor" class={fieldClass} bind:value={doctor_contact_id}>
						<option value="">{t('appointments.form.doctorNone')}</option>
						{#if orphanDoctorContact}
							<option value={orphanDoctorContact.id}>{doctorLabel(orphanDoctorContact)}</option>
						{/if}
						{#each doctorContacts as c (c.id)}
							<option value={c.id}>{doctorLabel(c)}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class={labelClass} for="appt-hotel">Otel</label>
					<select id="appt-hotel" class={fieldClass} bind:value={hotel_contact_id}>
						<option value="">—</option>
						{#if orphanHotelContact}
							<option value={orphanHotelContact.id}>{orphanHotelContact.display_name}</option>
						{/if}
						{#each hotelContacts as c (c.id)}
							<option value={c.id}>{c.display_name}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class={labelClass} for="appt-transfer-c"
						>{t('appointments.form.transferCompany')}</label
					>
					<select id="appt-transfer-c" class={fieldClass} bind:value={transfer_contact_id}>
						<option value="">—</option>
						{#if orphanTransferContact}
							<option value={orphanTransferContact.id}>{orphanTransferContact.display_name}</option>
						{/if}
						{#each transferContacts as c (c.id)}
							<option value={c.id}>{c.display_name}</option>
						{/each}
					</select>
				</div>
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
	{/if}
	{#snippet footer()}
		{#if confirmingDelete}
			<Button variant="ghost" type="button" onclick={cancelDelete} disabled={saving}>
				{t('appointments.deleteBack')}
			</Button>
			<Button
				variant="destructive"
				type="button"
				onclick={confirmDelete}
				disabled={saving || !ondelete}
			>
				{saving ? t('appointments.deleting') : t('appointments.deleteConfirmAction')}
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
					{t('appointments.delete')}
				</Button>
			{/if}
			<Button variant="ghost" type="button" onclick={() => (open = false)} disabled={saving}
				>{t('common.cancel')}</Button
			>
			<Button
				type="submit"
				form="appointment-form"
				disabled={saving || !contact_id || !startsLocal}
			>
				{saving ? t('common.saving') : isEdit ? t('common.save') : t('common.create')}
			</Button>
		{/if}
	{/snippet}
</Dialog>

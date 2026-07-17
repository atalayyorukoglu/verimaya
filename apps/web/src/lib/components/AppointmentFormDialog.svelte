<script lang="ts">
	import type {
		Appointment,
		AppointmentCreate,
		AppointmentStatus,
		AppointmentUpdate,
		Patient
	} from '@verimaya/shared';
	import { appointmentStatusLabels } from '@verimaya/shared';
	import { fieldClass, labelClass, textareaClass } from '$lib/api';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';

	let {
		open = $bindable(false),
		appointment = null,
		patients = [],
		saving = false,
		error = null,
		onsubmit
	}: {
		open?: boolean;
		appointment?: Appointment | null;
		patients?: Patient[];
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: AppointmentCreate | AppointmentUpdate) => void | Promise<void>;
	} = $props();

	const statuses = Object.keys(appointmentStatusLabels) as AppointmentStatus[];

	let patient_id = $state('');
	let title = $state('');
	let appointment_type = $state('Konsültasyon');
	let status = $state<AppointmentStatus>('scheduled');
	let startsLocal = $state('');
	let endsLocal = $state('');
	let clinic_name = $state('');
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
		patient_id = appointment?.patient_id ?? patients[0]?.id ?? '';
		title = appointment?.title ?? '';
		appointment_type = appointment?.appointment_type ?? 'Konsültasyon';
		status = appointment?.status ?? 'scheduled';
		startsLocal = appointment
			? toLocalInput(appointment.starts_at)
			: toLocalInput(new Date(Date.now() + 3600_000).toISOString());
		endsLocal = appointment?.ends_at
			? toLocalInput(appointment.ends_at)
			: toLocalInput(new Date(Date.now() + 5400_000).toISOString());
		clinic_name = appointment?.clinic_name ?? '';
		notes = appointment?.notes ?? '';
	});

	const isEdit = $derived(!!appointment);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!patient_id || !startsLocal) return;
		const payload = {
			patient_id,
			title: title.trim() || null,
			appointment_type: appointment_type.trim() || null,
			status,
			starts_at: fromLocalInput(startsLocal),
			ends_at: endsLocal ? fromLocalInput(endsLocal) : null,
			clinic_name: clinic_name.trim() || null,
			hotel_name: appointment?.hotel_name ?? null,
			transfer_note: appointment?.transfer_note ?? null,
			notes: notes.trim() || null
		};
		await onsubmit(payload);
	}
</script>

<Dialog
	bind:open
	title={isEdit ? 'Randevuyu düzenle' : 'Yeni randevu'}
	description="Hasta seçimi ve tarih zorunlu."
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
				<input id="appt-type" class={fieldClass} bind:value={appointment_type} maxlength={128} />
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
		<div>
			<label class={labelClass} for="appt-clinic">Klinik</label>
			<input id="appt-clinic" class={fieldClass} bind:value={clinic_name} maxlength={255} />
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

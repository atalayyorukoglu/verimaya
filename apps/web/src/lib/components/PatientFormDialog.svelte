<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type {
		MembershipUser,
		Patient,
		PatientCreate,
		PatientStatus,
		PatientUpdate
	} from '@verimaya/shared';
	import { PATIENT_SOURCE_PRESETS, patientStatusLabels } from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass, listUrl, textareaClass } from '$lib/api';
	import {
		initPatientSourceSelect,
		PATIENT_SOURCE_SELECT_OTHER,
		PATIENT_SOURCE_SELECT_UNKNOWN,
		resolvePatientSource
	} from '$lib/patient-source-select';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';

	type MembersPage = { items: MembershipUser[]; next_cursor: string | null };

	let {
		open = $bindable(false),
		patient = null,
		saving = false,
		error = null,
		onsubmit
	}: {
		open?: boolean;
		patient?: Patient | null;
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: PatientCreate | PatientUpdate) => void | Promise<void>;
	} = $props();

	const statuses = Object.keys(patientStatusLabels) as PatientStatus[];
	const qs = useQueryScope();

	const membersQuery = createQuery(() => ({
		queryKey: qs.keys.members.list({ for: 'patient-form' }),
		queryFn: () => apiGet<MembersPage>(listUrl('members', { limit: 50 })),
		enabled: open && qs.ready
	}));

	let full_name = $state('');
	let phone = $state('');
	let email = $state('');
	let status = $state<PatientStatus>('scheduled');
	let sourceSelect = $state(PATIENT_SOURCE_SELECT_UNKNOWN);
	let sourceCustom = $state('');
	let notes = $state('');
	let assigned_user_id = $state('');

	$effect(() => {
		if (!open) return;
		full_name = patient?.full_name ?? '';
		phone = patient?.phone ?? '';
		email = patient?.email ?? '';
		status = patient?.status ?? 'scheduled';
		// Legacy / non-preset sources (e.g. GHL `ghl`) must open as Diğer… with the value kept.
		const sourceInit = initPatientSourceSelect(patient?.source);
		sourceSelect = sourceInit.selectValue;
		sourceCustom = sourceInit.customSource;
		notes = patient?.notes ?? '';
		assigned_user_id = patient?.assigned_user_id ?? '';
	});

	const isEdit = $derived(!!patient);
	const members = $derived(membersQuery.data?.items ?? []);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		const payload = {
			full_name: full_name.trim(),
			phone: phone.trim() || null,
			email: email.trim() || null,
			status,
			source: resolvePatientSource(sourceSelect, sourceCustom),
			notes: notes.trim() || null,
			assigned_user_id: assigned_user_id || null,
			contact_id: patient?.contact_id ?? null
		};
		await onsubmit(payload);
	}
</script>

<Dialog
	bind:open
	title={isEdit ? t('patients.form.editTitle') : t('patients.form.createTitle')}
	description={t('patients.form.description')}
>
	<form id="patient-form" class="space-y-3" onsubmit={handleSubmit}>
		<div>
			<label class={labelClass} for="patient-name">{t('patients.form.fullName')}</label>
			<input id="patient-name" class={fieldClass} bind:value={full_name} required maxlength={255} />
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="patient-phone">{t('patients.form.phone')}</label>
				<input id="patient-phone" class={fieldClass} bind:value={phone} maxlength={64} />
			</div>
			<div>
				<label class={labelClass} for="patient-email">{t('patients.form.email')}</label>
				<input
					id="patient-email"
					class={fieldClass}
					type="email"
					bind:value={email}
					maxlength={255}
				/>
			</div>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="patient-status">{t('patients.form.status')}</label>
				<select id="patient-status" class={fieldClass} bind:value={status}>
					{#each statuses as s (s)}
						<option value={s}>{patientStatusLabels[s]}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class={labelClass} for="patient-source">{t('patients.form.source')}</label>
				<select id="patient-source" class={fieldClass} bind:value={sourceSelect} required>
					<option value={PATIENT_SOURCE_SELECT_UNKNOWN}>{t('patients.form.sourceUnknown')}</option>
					{#each PATIENT_SOURCE_PRESETS as preset (preset)}
						<option value={preset}>{preset}</option>
					{/each}
					<option value={PATIENT_SOURCE_SELECT_OTHER}>{t('patients.form.sourceOther')}</option>
				</select>
				{#if sourceSelect === PATIENT_SOURCE_SELECT_OTHER}
					<input
						id="patient-source-other"
						class="{fieldClass} mt-2"
						bind:value={sourceCustom}
						placeholder={t('patients.form.sourceOtherPlaceholder')}
						maxlength={128}
					/>
				{/if}
			</div>
		</div>
		<div>
			<label class={labelClass} for="patient-assignee">{t('patients.form.assignee')}</label>
			<select id="patient-assignee" class={fieldClass} bind:value={assigned_user_id}>
				<option value="">—</option>
				{#each members as m (m.id)}
					<option value={m.id}>{m.display_name}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class={labelClass} for="patient-notes">{t('patients.form.notes')}</label>
			<textarea id="patient-notes" class={textareaClass} bind:value={notes} maxlength={8000}
			></textarea>
		</div>
		{#if error}
			<p class="text-sm text-danger">{error}</p>
		{/if}
	</form>
	{#snippet footer()}
		<Button variant="ghost" type="button" onclick={() => (open = false)} disabled={saving}
			>{t('patients.form.cancel')}</Button
		>
		<Button type="submit" form="patient-form" disabled={saving || !full_name.trim()}>
			{saving
				? t('patients.form.saving')
				: isEdit
					? t('patients.form.save')
					: t('patients.form.create')}
		</Button>
	{/snippet}
</Dialog>

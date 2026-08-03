<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type {
		MembershipUser,
		Patient,
		PatientCreate,
		PatientStatus,
		PatientUpdate
	} from '@verimaya/shared';
	import { patientStatusLabels } from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass, listUrl, textareaClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
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
	const { keys, ready } = useQueryScope();

	const membersQuery = createQuery(() => ({
		queryKey: keys.members.list({ for: 'patient-form' }),
		queryFn: () => apiGet<MembersPage>(listUrl('members', { limit: 50 })),
		enabled: open && ready
	}));

	let full_name = $state('');
	let phone = $state('');
	let email = $state('');
	let status = $state<PatientStatus>('lead');
	let source = $state('');
	let notes = $state('');
	let assigned_user_id = $state('');

	$effect(() => {
		if (!open) return;
		full_name = patient?.full_name ?? '';
		phone = patient?.phone ?? '';
		email = patient?.email ?? '';
		status = patient?.status ?? 'lead';
		source = patient?.source ?? '';
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
			source: source.trim() || null,
			notes: notes.trim() || null,
			assigned_user_id: assigned_user_id || null,
			contact_id: patient?.contact_id ?? null
		};
		await onsubmit(payload);
	}
</script>

<Dialog
	bind:open
	title={isEdit ? 'Hastayı düzenle' : 'Yeni hasta'}
	description="MSW üzerinden kaydedilir."
>
	<form id="patient-form" class="space-y-3" onsubmit={handleSubmit}>
		<div>
			<label class={labelClass} for="patient-name">Ad soyad</label>
			<input id="patient-name" class={fieldClass} bind:value={full_name} required maxlength={255} />
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="patient-phone">Telefon</label>
				<input id="patient-phone" class={fieldClass} bind:value={phone} maxlength={64} />
			</div>
			<div>
				<label class={labelClass} for="patient-email">E-posta</label>
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
				<label class={labelClass} for="patient-status">Durum</label>
				<select id="patient-status" class={fieldClass} bind:value={status}>
					{#each statuses as s (s)}
						<option value={s}>{patientStatusLabels[s]}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class={labelClass} for="patient-source">Kaynak</label>
				<input id="patient-source" class={fieldClass} bind:value={source} maxlength={128} />
			</div>
		</div>
		<div>
			<label class={labelClass} for="patient-assignee">Sorumlu</label>
			<select id="patient-assignee" class={fieldClass} bind:value={assigned_user_id}>
				<option value="">—</option>
				{#each members as m (m.id)}
					<option value={m.id}>{m.display_name}</option>
				{/each}
			</select>
		</div>
		<div>
			<label class={labelClass} for="patient-notes">Notlar</label>
			<textarea id="patient-notes" class={textareaClass} bind:value={notes} maxlength={8000}
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
		<Button type="submit" form="patient-form" disabled={saving || !full_name.trim()}>
			{saving ? 'Kaydediliyor…' : isEdit ? 'Kaydet' : 'Oluştur'}
		</Button>
	{/snippet}
</Dialog>

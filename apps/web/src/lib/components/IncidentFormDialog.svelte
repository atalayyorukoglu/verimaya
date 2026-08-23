<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type {
		Appointment,
		IncidentCreate,
		IncidentType,
		SupportedCurrency
	} from '@verimaya/shared';
	import { apiPaths, SUPPORTED_CURRENCIES } from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass, textareaClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import { formatDate, formatTime } from '$lib/format';

	/**
	 * Giriş noktası — dosya (hasta) içinden tek tıkla. docs/2026-08-23-maya-icgoru-sorulari.md
	 * § 5 "üç şart": bağlam (dosya, tarih, varsa randevu) önceden dolu gelir; kullanıcı yalnız
	 * türü ve varsa maliyeti seçer. v1 yalnız klinik — `area=clinic` sabit.
	 */
	let {
		open = $bindable(false),
		contactId,
		appointments = [],
		saving = false,
		error = null,
		onsubmit
	}: {
		open?: boolean;
		contactId: string;
		/** Bu dosyanın randevuları, en yeni önce — "varsa randevu formda hazır gelsin". */
		appointments?: Appointment[];
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: IncidentCreate) => void | Promise<void>;
	} = $props();

	const qs = useQueryScope();

	const typesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.incidentTypes({ area: 'clinic' }),
		queryFn: () =>
			apiGet<{ items: IncidentType[] }>(`${apiPaths.settingsIncidentTypes}?area=clinic`),
		enabled: open && qs.ready
	}));

	const types = $derived(
		[...(typesQuery.data?.items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
	);

	function todayLocal(): string {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	let incident_type_id = $state('');
	let appointment_id = $state('');
	let occurred_on = $state('');
	let costMajor = $state('');
	let currency = $state<SupportedCurrency>('TRY');
	let description = $state('');

	$effect(() => {
		if (!open) return;
		incident_type_id = types[0]?.id ?? '';
		// En yeni randevu varsayılan olarak seçili gelir — kullanıcı gerekirse değiştirir.
		appointment_id = appointments[0]?.id ?? '';
		occurred_on = todayLocal();
		costMajor = '';
		currency = 'TRY';
		description = '';
	});

	// types geç yüklenirse (query henüz dönmediyse) ilk türü sonradan seç.
	$effect(() => {
		if (open && !incident_type_id && types.length > 0) {
			incident_type_id = types[0]!.id;
		}
	});

	function appointmentLabel(a: Appointment): string {
		const label = a.title ?? a.appointment_type ?? t('contacts.files.appointmentFallback');
		return `${label} · ${formatDate(a.starts_at)} ${formatTime(a.starts_at)}`;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!incident_type_id || !occurred_on) return;
		const costAmount = costMajor.trim()
			? Math.round(Number.parseFloat(costMajor.replace(',', '.')) * 100)
			: null;
		const payload: IncidentCreate = {
			contact_id: contactId,
			incident_type_id,
			appointment_id: appointment_id || null,
			cost_amount: Number.isFinite(costAmount) ? costAmount : null,
			cost_currency: costAmount != null && Number.isFinite(costAmount) ? currency : null,
			description: description.trim() || null,
			occurred_on
		};
		await onsubmit(payload);
	}
</script>

<Dialog
	bind:open
	title={t('incidents.form.createTitle')}
	description={t('incidents.form.description')}
>
	<form id="incident-form" class="space-y-3" onsubmit={handleSubmit}>
		<div>
			<label class={labelClass} for="incident-type">{t('incidents.form.type')}</label>
			{#if typesQuery.isPending}
				<p class="text-sm text-text-muted">{t('common.loading')}</p>
			{:else if types.length === 0}
				<p class="text-sm text-text-muted">{t('incidents.form.noTypes')}</p>
			{:else}
				<select id="incident-type" class={fieldClass} bind:value={incident_type_id} required>
					{#each types as ty (ty.id)}
						<option value={ty.id}>{ty.name}</option>
					{/each}
				</select>
			{/if}
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="incident-occurred-on">{t('incidents.form.occurredOn')}</label
				>
				<input
					id="incident-occurred-on"
					class={fieldClass}
					type="date"
					bind:value={occurred_on}
					required
				/>
			</div>
			<div>
				<label class={labelClass} for="incident-appointment"
					>{t('incidents.form.appointment')}</label
				>
				<select id="incident-appointment" class={fieldClass} bind:value={appointment_id}>
					<option value="">{t('incidents.form.appointmentNone')}</option>
					{#each appointments as a (a.id)}
						<option value={a.id}>{appointmentLabel(a)}</option>
					{/each}
				</select>
			</div>
		</div>
		<div>
			<label class={labelClass} for="incident-cost">{t('incidents.form.cost')}</label>
			<div class="flex gap-2">
				<input
					id="incident-cost"
					class={fieldClass}
					type="text"
					inputmode="decimal"
					bind:value={costMajor}
					placeholder="0"
				/>
				<select class={fieldClass} style="max-width: 6.5rem" bind:value={currency}>
					{#each SUPPORTED_CURRENCIES as c (c)}
						<option value={c}>{c}</option>
					{/each}
				</select>
			</div>
		</div>
		<div>
			<label class={labelClass} for="incident-description"
				>{t('incidents.form.descriptionField')}</label
			>
			<textarea
				id="incident-description"
				class={textareaClass}
				bind:value={description}
				maxlength={4000}></textarea>
		</div>
		{#if error}
			<p class="text-sm text-danger">{error}</p>
		{/if}
	</form>
	{#snippet footer()}
		<Button variant="ghost" type="button" onclick={() => (open = false)} disabled={saving}>
			{t('common.cancel')}
		</Button>
		<Button
			type="submit"
			form="incident-form"
			disabled={saving || !incident_type_id || !occurred_on}
		>
			{saving ? t('common.saving') : t('common.create')}
		</Button>
	{/snippet}
</Dialog>

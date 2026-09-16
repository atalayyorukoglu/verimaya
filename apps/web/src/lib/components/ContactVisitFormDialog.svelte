<script lang="ts">
	import type {
		ContactVisit,
		ContactVisitCreate,
		ContactVisitHotelCoveredBy,
		ContactVisitStatus,
		ContactVisitType
	} from '@verimaya/shared';
	import {
		contactVisitHotelCoveredByLabels,
		contactVisitHotelCoveredBySchema,
		contactVisitStatusLabels,
		contactVisitStatusSchema,
		contactVisitTypeLabels,
		contactVisitTypeSchema
	} from '@verimaya/shared';
	import { fieldClass, labelClass, textareaClass } from '$lib/api';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';

	/**
	 * VIZIT-01 — vizit ekleme/düzenleme.
	 *
	 * Tarih ve saat AYRI iki alan: mesajlarda çoğu zaman yalnız gün yazıyor
	 * ("26 nisan gelis"). Saat boş bırakılırsa `*_time_known=false` gider ve liste
	 * uydurma bir "00:00" göstermez.
	 */
	let {
		open = $bindable(false),
		visit = null,
		saving = false,
		error = null,
		onsubmit,
		ondelete
	}: {
		open?: boolean;
		visit?: ContactVisit | null;
		saving?: boolean;
		error?: string | null;
		onsubmit: (data: ContactVisitCreate) => void | Promise<void>;
		ondelete?: () => void | Promise<void>;
	} = $props();

	const VISIT_TYPES = contactVisitTypeSchema.options;
	const STATUSES = contactVisitStatusSchema.options;
	const COVERED_BY = contactVisitHotelCoveredBySchema.options;

	let visit_type = $state<ContactVisitType>('visit_1');
	let sequence = $state('');
	let arrivalDate = $state('');
	let arrivalTime = $state('');
	let departureDate = $state('');
	let departureTime = $state('');
	let arrival_flight = $state('');
	let departure_flight = $state('');
	let hotel = $state('');
	let hotel_covered_by = $state<ContactVisitHotelCoveredBy>('unknown');
	let transfer_provider = $state('');
	let clinic = $state('');
	let doctor = $state('');
	let treatment_plan = $state('');
	let status = $state<ContactVisitStatus>('planned');
	let notes = $state('');

	/** ISO → `{date, time}`; saat bilinmiyorsa time boş kalır. Hep UTC parçaları. */
	function split(iso: string | null, timeKnown: boolean): { date: string; time: string } {
		if (!iso) return { date: '', time: '' };
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return { date: '', time: '' };
		const pad = (n: number) => String(n).padStart(2, '0');
		const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
		const time = timeKnown ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : '';
		return { date, time };
	}

	function join(date: string, time: string): { at: string | null; known: boolean } {
		if (!date) return { at: null, known: false };
		const hhmm = time || '00:00';
		return { at: `${date}T${hhmm}:00.000Z`, known: time.length > 0 };
	}

	$effect(() => {
		if (!open) return;
		const v = visit;
		visit_type = v?.visit_type ?? 'visit_1';
		sequence = v?.sequence != null ? String(v.sequence) : '';
		const a = split(v?.arrival_at ?? null, v?.arrival_time_known ?? true);
		arrivalDate = a.date;
		arrivalTime = a.time;
		const d = split(v?.departure_at ?? null, v?.departure_time_known ?? true);
		departureDate = d.date;
		departureTime = d.time;
		arrival_flight = v?.arrival_flight ?? '';
		departure_flight = v?.departure_flight ?? '';
		hotel = v?.hotel ?? '';
		hotel_covered_by = v?.hotel_covered_by ?? 'unknown';
		transfer_provider = v?.transfer_provider ?? '';
		clinic = v?.clinic ?? '';
		doctor = v?.doctor ?? '';
		treatment_plan = v?.treatment_plan ?? '';
		status = v?.status ?? 'planned';
		notes = v?.notes ?? '';
	});

	function bos(s: string): string | null {
		const x = s.trim();
		return x.length > 0 ? x : null;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		const arr = join(arrivalDate, arrivalTime);
		const dep = join(departureDate, departureTime);
		const seq = sequence.trim() ? Number.parseInt(sequence, 10) : null;
		await onsubmit({
			visit_type,
			sequence: seq != null && Number.isFinite(seq) ? seq : null,
			arrival_at: arr.at,
			arrival_time_known: arr.known,
			departure_at: dep.at,
			departure_time_known: dep.known,
			arrival_flight: bos(arrival_flight),
			departure_flight: bos(departure_flight),
			hotel: bos(hotel),
			hotel_covered_by,
			transfer_provider: bos(transfer_provider),
			clinic: bos(clinic),
			doctor: bos(doctor),
			treatment_plan: bos(treatment_plan),
			status,
			notes: bos(notes)
		});
	}

	async function handleDelete() {
		if (!ondelete) return;
		if (!confirm(t('contacts.visits.deleteConfirm'))) return;
		await ondelete();
	}
</script>

<Dialog
	bind:open
	title={visit ? t('contacts.visits.editTitle') : t('contacts.visits.createTitle')}
	description={t('contacts.visits.subtitle')}
>
	<form id="contact-visit-form" class="space-y-3" onsubmit={handleSubmit}>
		<div class="grid gap-3 sm:grid-cols-3">
			<div>
				<label class={labelClass} for="visit-type">{t('contacts.visits.type')}</label>
				<select id="visit-type" class={fieldClass} bind:value={visit_type}>
					{#each VISIT_TYPES as ty (ty)}
						<option value={ty}>{contactVisitTypeLabels[ty]}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class={labelClass} for="visit-sequence">{t('contacts.visits.sequence')}</label>
				<input
					id="visit-sequence"
					class={fieldClass}
					type="number"
					min="0"
					max="99"
					bind:value={sequence}
				/>
			</div>
			<div>
				<label class={labelClass} for="visit-status">{t('contacts.visits.status')}</label>
				<select id="visit-status" class={fieldClass} bind:value={status}>
					{#each STATUSES as st (st)}
						<option value={st}>{contactVisitStatusLabels[st]}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="visit-arrival-date">{t('contacts.visits.arrival')}</label>
				<div class="flex gap-2">
					<input
						id="visit-arrival-date"
						class={fieldClass}
						type="date"
						bind:value={arrivalDate}
						aria-label={t('contacts.visits.arrival')}
					/>
					<input
						class={fieldClass}
						style="max-width: 7.5rem"
						type="time"
						bind:value={arrivalTime}
						aria-label={`${t('contacts.visits.arrival')} — ${t('contacts.visits.timeUnknown')}`}
					/>
				</div>
			</div>
			<div>
				<label class={labelClass} for="visit-departure-date">{t('contacts.visits.departure')}</label
				>
				<div class="flex gap-2">
					<input
						id="visit-departure-date"
						class={fieldClass}
						type="date"
						bind:value={departureDate}
						aria-label={t('contacts.visits.departure')}
					/>
					<input
						class={fieldClass}
						style="max-width: 7.5rem"
						type="time"
						bind:value={departureTime}
						aria-label={`${t('contacts.visits.departure')} — ${t('contacts.visits.timeUnknown')}`}
					/>
				</div>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="visit-arrival-flight"
					>{t('contacts.visits.arrivalFlight')}</label
				>
				<input
					id="visit-arrival-flight"
					class={fieldClass}
					type="text"
					bind:value={arrival_flight}
					maxlength={255}
				/>
			</div>
			<div>
				<label class={labelClass} for="visit-departure-flight"
					>{t('contacts.visits.departureFlight')}</label
				>
				<input
					id="visit-departure-flight"
					class={fieldClass}
					type="text"
					bind:value={departure_flight}
					maxlength={255}
				/>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class={labelClass} for="visit-hotel">{t('contacts.visits.hotel')}</label>
				<input id="visit-hotel" class={fieldClass} type="text" bind:value={hotel} maxlength={255} />
			</div>
			<div>
				<label class={labelClass} for="visit-covered">{t('contacts.visits.hotelCoveredBy')}</label>
				<select id="visit-covered" class={fieldClass} bind:value={hotel_covered_by}>
					{#each COVERED_BY as c (c)}
						<option value={c}>{contactVisitHotelCoveredByLabels[c]}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-3">
			<div>
				<label class={labelClass} for="visit-clinic">{t('contacts.visits.clinic')}</label>
				<input
					id="visit-clinic"
					class={fieldClass}
					type="text"
					bind:value={clinic}
					maxlength={255}
				/>
			</div>
			<div>
				<label class={labelClass} for="visit-doctor">{t('contacts.visits.doctor')}</label>
				<input
					id="visit-doctor"
					class={fieldClass}
					type="text"
					bind:value={doctor}
					maxlength={255}
				/>
			</div>
			<div>
				<label class={labelClass} for="visit-transfer"
					>{t('contacts.visits.transferProvider')}</label
				>
				<input
					id="visit-transfer"
					class={fieldClass}
					type="text"
					bind:value={transfer_provider}
					maxlength={255}
				/>
			</div>
		</div>

		<div>
			<label class={labelClass} for="visit-plan">{t('contacts.visits.treatmentPlan')}</label>
			<textarea id="visit-plan" class={textareaClass} bind:value={treatment_plan} maxlength={4000}
			></textarea>
		</div>
		<div>
			<label class={labelClass} for="visit-notes">{t('contacts.visits.notes')}</label>
			<textarea id="visit-notes" class={textareaClass} bind:value={notes} maxlength={4000}
			></textarea>
		</div>

		{#if error}
			<p class="text-sm text-danger">{error}</p>
		{/if}
	</form>
	{#snippet footer()}
		{#if ondelete}
			<Button variant="ghost" type="button" onclick={handleDelete} disabled={saving}>
				{t('contacts.visits.delete')}
			</Button>
		{/if}
		<Button variant="ghost" type="button" onclick={() => (open = false)} disabled={saving}>
			{t('common.cancel')}
		</Button>
		<Button type="submit" form="contact-visit-form" disabled={saving}>
			{saving ? t('contacts.visits.saving') : t('contacts.visits.save')}
		</Button>
	{/snippet}
</Dialog>

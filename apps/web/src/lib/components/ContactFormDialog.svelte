<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		Contact,
		ContactCreate,
		ContactStatus,
		ContactType,
		ContactUpdate,
		MembershipUser,
		Organization
	} from '@verimaya/shared';
	import { apiPaths, CONTACT_MEDIUM_PRESETS, contactStatusLabels } from '@verimaya/shared';
	import {
		apiGet,
		apiSend,
		ApiRequestError,
		fieldClass,
		labelClass,
		listUrl,
		textareaClass
	} from '$lib/api';
	import {
		CONTACT_SOURCE_REFERRAL,
		CONTACT_SOURCE_SELECT_OTHER,
		CONTACT_SOURCE_SELECT_PRESETS,
		CONTACT_SOURCE_SELECT_UNKNOWN,
		CONTACT_SOURCE_WITH_MEDIUM,
		initContactSourceSelect,
		resolveContactSource
	} from '$lib/contact-source-select';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import { memberAssigneeUserId } from '$lib/member-assignee';
	import { type DeleteConfirmPhase, runConfirmedDelete } from '$lib/components/delete-confirm-flow';

	const ORG_LINKED_TYPE_NAMES = new Set(['Klinik', 'Otel', 'Transfer']);
	const HASTA_TYPE_NAME = 'Hasta';
	const NEW_ORGANIZATION = '__new_organization__';

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

	type MembersPage = { items: MembershipUser[]; next_cursor: string | null };
	type ContactsPage = { items: Contact[]; next_cursor: string | null };

	const statuses = Object.keys(contactStatusLabels) as ContactStatus[];
	const qs = useQueryScope();
	const queryClient = useQueryClient();

	const typesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.contactTypes(),
		queryFn: () => apiGet<{ items: ContactType[] }>(apiPaths.settingsContactTypes),
		enabled: open && qs.ready
	}));

	const organizationsQuery = createQuery(() => ({
		queryKey: qs.keys.settings.organizations(),
		queryFn: () => apiGet<{ items: Organization[] }>(apiPaths.settingsOrganizations),
		enabled: open && qs.ready
	}));

	const membersQuery = createQuery(() => ({
		queryKey: qs.keys.members.list({ for: 'contact-form' }),
		queryFn: () => apiGet<MembersPage>(listUrl('members', { limit: 50 })),
		enabled: open && qs.ready
	}));

	let contact_type_id = $state('');
	let first_name = $state('');
	let last_name = $state('');
	let organization_id = $state('');
	let showNewOrganization = $state(false);
	let newOrganizationName = $state('');
	let creatingOrganization = $state(false);
	let organizationCreateError = $state<string | null>(null);
	let phone = $state('');
	let email = $state('');
	let notes = $state('');
	let is_internal = $state(false);
	let status = $state<ContactStatus>('scheduled');
	let assigned_user_id = $state('');
	let sourceSelect = $state(CONTACT_SOURCE_SELECT_UNKNOWN);
	let sourceCustom = $state('');
	let medium = $state('');
	let campaign = $state('');
	let referredByContactId = $state('');
	let referredByDisplayName = $state('');
	let referredBySearch = $state('');
	let deletePhase = $state<DeleteConfirmPhase>('form');

	const contactTypes = $derived(typesQuery.data?.items ?? []);
	const organizations = $derived(
		[...(organizationsQuery.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name))
	);
	const selectedTypeName = $derived(
		contactTypes.find((ct) => ct.id === contact_type_id)?.name ?? ''
	);
	const isHastaType = $derived(selectedTypeName === HASTA_TYPE_NAME);
	const showOrganization = $derived(ORG_LINKED_TYPE_NAMES.has(selectedTypeName));
	const organizationInList = $derived(
		!organization_id || organizations.some((o) => o.id === organization_id)
	);
	const isReferralSource = $derived(
		sourceSelect === CONTACT_SOURCE_REFERRAL ||
			resolveContactSource(sourceSelect, sourceCustom) === CONTACT_SOURCE_REFERRAL
	);
	const showMedium = $derived(sourceSelect === CONTACT_SOURCE_WITH_MEDIUM);
	const showCampaign = $derived(sourceSelect !== CONTACT_SOURCE_SELECT_UNKNOWN);
	const members = $derived(membersQuery.data?.items ?? []);
	const assignableMembers = $derived(members.filter((m) => memberAssigneeUserId(m)));

	const referralSearchQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.list({ q: referredBySearch, for: 'referral-picker' }),
		queryFn: () =>
			apiGet<ContactsPage>(listUrl('contacts', { q: referredBySearch.trim(), limit: 20 })),
		enabled:
			open && qs.ready && isHastaType && isReferralSource && referredBySearch.trim().length >= 2
	}));

	const referredByDetailQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.detail(referredByContactId),
		queryFn: () => apiGet<Contact>(apiPaths.contact(referredByContactId)),
		enabled: open && qs.ready && !!referredByContactId && !referredByDisplayName
	}));

	const referralResults = $derived(
		(referralSearchQuery.data?.items ?? []).filter((c) => c.id !== contact?.id)
	);

	const referredByLabel = $derived(
		referredByDisplayName || referredByDetailQuery.data?.display_name || ''
	);

	$effect(() => {
		if (!open) {
			deletePhase = 'form';
			return;
		}
		const types = typesQuery.data?.items ?? [];
		contact_type_id = contact?.contact_type_id ?? types[0]?.id ?? '';
		first_name = contact?.first_name ?? '';
		last_name = contact?.last_name ?? '';
		organization_id = contact?.organization_id ?? '';
		showNewOrganization = false;
		newOrganizationName = '';
		organizationCreateError = null;
		phone = contact?.phone ?? '';
		email = contact?.email ?? '';
		notes = contact?.notes ?? '';
		is_internal = contact?.is_internal ?? false;
		status = contact?.status ?? 'scheduled';
		assigned_user_id = contact?.assigned_user_id ?? '';
		const sourceInit = initContactSourceSelect(contact?.source);
		sourceSelect = sourceInit.selectValue;
		sourceCustom = sourceInit.customSource;
		medium = contact?.medium ?? '';
		campaign = contact?.campaign ?? '';
		referredByContactId = contact?.referred_by_contact_id ?? '';
		referredByDisplayName = '';
		referredBySearch = '';
		deletePhase = 'form';
	});

	function onSourceSelectChange(next: string) {
		sourceSelect = next;
		if (next !== CONTACT_SOURCE_REFERRAL) {
			referredByContactId = '';
			referredByDisplayName = '';
			referredBySearch = '';
		}
		if (next !== CONTACT_SOURCE_WITH_MEDIUM) {
			medium = '';
		}
		if (next === CONTACT_SOURCE_SELECT_UNKNOWN) {
			campaign = '';
		}
	}

	function onOrganizationSelectChange(value: string) {
		if (value === NEW_ORGANIZATION) {
			showNewOrganization = true;
			organizationCreateError = null;
			return;
		}
		showNewOrganization = false;
		newOrganizationName = '';
		organizationCreateError = null;
		organization_id = value;
	}

	function cancelNewOrganization() {
		showNewOrganization = false;
		newOrganizationName = '';
		organizationCreateError = null;
	}

	async function createOrganizationInline() {
		const name = newOrganizationName.trim();
		if (!name || creatingOrganization) return;
		creatingOrganization = true;
		organizationCreateError = null;
		try {
			const created = await apiSend<Organization>(apiPaths.settingsOrganizations, 'POST', {
				name
			});
			await queryClient.invalidateQueries({ queryKey: qs.keys.settings.organizations() });
			organization_id = created.id;
			showNewOrganization = false;
			newOrganizationName = '';
		} catch (err) {
			organizationCreateError =
				err instanceof ApiRequestError && err.code === 'duplicate_type_name'
					? t('settings.dictionaries.duplicateName')
					: err instanceof Error
						? err.message
						: t('contacts.form.organizationCreateFailed');
		} finally {
			creatingOrganization = false;
		}
	}

	const isEdit = $derived(!!contact);
	const confirmingDelete = $derived(deletePhase === 'confirm');

	const deleteDetail = $derived.by(() => {
		if (!contact) return '';
		return `${contact.display_name} · ${contact.contact_type_name}`;
	});

	const dialogTitle = $derived(
		confirmingDelete
			? t('contacts.deleteConfirmTitle')
			: isEdit
				? t('contacts.form.editTitle')
				: t('contacts.form.createTitle')
	);

	const canSubmit = $derived(!!contact_type_id && !!first_name.trim() && !showNewOrganization);

	function pickReferral(c: Contact) {
		referredByContactId = c.id;
		referredByDisplayName = c.display_name;
		referredBySearch = '';
	}

	function clearReferral() {
		referredByContactId = '';
		referredByDisplayName = '';
		referredBySearch = '';
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (confirmingDelete || !canSubmit) return;

		const resolvedSource = resolveContactSource(sourceSelect, sourceCustom);
		const showMediumOnSubmit =
			sourceSelect === CONTACT_SOURCE_WITH_MEDIUM || resolvedSource === CONTACT_SOURCE_WITH_MEDIUM;
		const showReferralOnSubmit =
			sourceSelect === CONTACT_SOURCE_REFERRAL || resolvedSource === CONTACT_SOURCE_REFERRAL;

		const payload: ContactCreate | ContactUpdate = {
			contact_type_id,
			first_name: first_name.trim(),
			last_name: last_name.trim() || null,
			phone: phone.trim() || null,
			email: email.trim() || null,
			notes: notes.trim() || null,
			is_internal,
			organization_id: showOrganization ? organization_id || null : null,
			status: isHastaType ? status : null,
			assigned_user_id: isHastaType ? assigned_user_id || null : null,
			source: isHastaType ? resolvedSource : null,
			medium: isHastaType && showMediumOnSubmit ? medium.trim() || null : null,
			campaign:
				isHastaType && sourceSelect !== CONTACT_SOURCE_SELECT_UNKNOWN
					? campaign.trim() || null
					: null,
			referred_by_contact_id:
				isHastaType && showReferralOnSubmit ? referredByContactId || null : null
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
	description={confirmingDelete ? undefined : t('contacts.form.description')}
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
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class={labelClass} for="c-first-name">{t('contacts.form.firstName')}</label>
					<input
						id="c-first-name"
						class={fieldClass}
						bind:value={first_name}
						required
						maxlength={255}
					/>
				</div>
				<div>
					<label class={labelClass} for="c-last-name">{t('contacts.form.lastName')}</label>
					<input id="c-last-name" class={fieldClass} bind:value={last_name} maxlength={255} />
				</div>
			</div>
			<div>
				<label class={labelClass} for="c-type">{t('contacts.form.type')}</label>
				<select id="c-type" class={fieldClass} bind:value={contact_type_id} required>
					{#each contactTypes as ct (ct.id)}
						<option value={ct.id}>{ct.name}</option>
					{/each}
				</select>
			</div>
			{#if showOrganization}
				<div>
					<label class={labelClass} for="c-organization">{t('contacts.form.organization')}</label>
					<select
						id="c-organization"
						class={fieldClass}
						disabled={creatingOrganization}
						value={showNewOrganization ? NEW_ORGANIZATION : organization_id}
						onchange={(e) => onOrganizationSelectChange(e.currentTarget.value)}
					>
						<option value="">{t('contacts.form.organizationNone')}</option>
						{#each organizations as org (org.id)}
							<option value={org.id}>{org.name}</option>
						{/each}
						{#if !organizationInList && organization_id}
							<option value={organization_id}>{t('contacts.form.organizationOrphan')}</option>
						{/if}
						<option value={NEW_ORGANIZATION}>{t('contacts.form.organizationNew')}</option>
					</select>
					{#if showNewOrganization}
						<div class="mt-2 space-y-2 rounded-[6px] border border-border bg-surface-2 p-3">
							<label class={labelClass} for="c-new-org-name"
								>{t('contacts.form.organizationName')}</label
							>
							<input
								id="c-new-org-name"
								class={fieldClass}
								disabled={creatingOrganization}
								bind:value={newOrganizationName}
							/>
							<div class="flex gap-2">
								<Button
									type="button"
									size="sm"
									disabled={creatingOrganization || !newOrganizationName.trim()}
									onclick={() => void createOrganizationInline()}
								>
									{creatingOrganization
										? t('contacts.form.organizationCreating')
										: t('contacts.form.organizationCreate')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={creatingOrganization}
									onclick={cancelNewOrganization}
								>
									{t('contacts.form.organizationCreateCancel')}
								</Button>
							</div>
							{#if organizationCreateError}
								<p class="text-sm text-danger">{organizationCreateError}</p>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class={labelClass} for="c-phone">{t('contacts.form.phone')}</label>
					<input id="c-phone" class={fieldClass} bind:value={phone} maxlength={64} />
				</div>
				<div>
					<label class={labelClass} for="c-email">{t('contacts.form.email')}</label>
					<input id="c-email" class={fieldClass} type="email" bind:value={email} maxlength={255} />
				</div>
			</div>
			{#if isHastaType}
				<div class="grid gap-3 sm:grid-cols-2">
					<div>
						<label class={labelClass} for="c-status">{t('contacts.form.status')}</label>
						<select id="c-status" class={fieldClass} bind:value={status}>
							{#each statuses as s (s)}
								<option value={s}>{contactStatusLabels[s]}</option>
							{/each}
						</select>
					</div>
					<div>
						<label class={labelClass} for="c-assignee">{t('contacts.form.assignee')}</label>
						<select id="c-assignee" class={fieldClass} bind:value={assigned_user_id}>
							<option value="">—</option>
							{#each assignableMembers as m (m.id)}
								<option value={memberAssigneeUserId(m)}>{m.display_name}</option>
							{/each}
						</select>
					</div>
				</div>
				<div>
					<label class={labelClass} for="c-source">{t('contacts.form.source')}</label>
					<select
						id="c-source"
						class={fieldClass}
						value={sourceSelect}
						required
						onchange={(e) => onSourceSelectChange(e.currentTarget.value)}
					>
						<option value={CONTACT_SOURCE_SELECT_UNKNOWN}>{t('contacts.form.sourceUnknown')}</option
						>
						{#each CONTACT_SOURCE_SELECT_PRESETS as preset (preset)}
							<option value={preset}>{preset}</option>
						{/each}
						<option value={CONTACT_SOURCE_SELECT_OTHER}>{t('contacts.form.sourceOther')}</option>
					</select>
					{#if sourceSelect === CONTACT_SOURCE_SELECT_OTHER}
						<input
							id="c-source-other"
							class="{fieldClass} mt-2"
							bind:value={sourceCustom}
							placeholder={t('contacts.form.sourceOtherPlaceholder')}
							maxlength={128}
						/>
					{/if}
				</div>
				{#if showMedium}
					<div>
						<label class={labelClass} for="c-medium">{t('contacts.form.medium')}</label>
						<select id="c-medium" class={fieldClass} bind:value={medium}>
							<option value="">—</option>
							{#each CONTACT_MEDIUM_PRESETS as preset (preset)}
								<option value={preset}>{preset}</option>
							{/each}
						</select>
					</div>
				{/if}
				{#if showCampaign}
					<div>
						<label class={labelClass} for="c-campaign">{t('contacts.form.campaign')}</label>
						<input id="c-campaign" class={fieldClass} bind:value={campaign} maxlength={128} />
					</div>
				{/if}
				{#if isReferralSource}
					<div class="space-y-2">
						<label class={labelClass} for="c-referred-by-search"
							>{t('contacts.form.referredBy')}</label
						>
						{#if referredByContactId && referredByLabel}
							<div
								class="flex items-center justify-between gap-2 rounded-[6px] border border-border bg-surface-2 px-3 py-2 text-sm"
							>
								<span class="min-w-0 truncate text-text">{referredByLabel}</span>
								<button
									type="button"
									class="shrink-0 text-xs text-text-muted hover:text-danger"
									onclick={clearReferral}
								>
									{t('contacts.form.referredByClear')}
								</button>
							</div>
						{:else}
							<input
								id="c-referred-by-search"
								class={fieldClass}
								bind:value={referredBySearch}
								placeholder={t('contacts.form.referredBySearch')}
								autocomplete="off"
							/>
							{#if referredBySearch.trim().length >= 2}
								{#if referralSearchQuery.isPending}
									<p class="text-xs text-text-muted">{t('common.loading')}</p>
								{:else if referralResults.length === 0}
									<p class="text-xs text-text-muted">{t('contacts.form.referredByEmpty')}</p>
								{:else}
									<ul
										class="max-h-40 overflow-y-auto rounded-[6px] border border-border bg-surface shadow-sm"
									>
										{#each referralResults as c (c.id)}
											<li>
												<button
													type="button"
													class="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
													onclick={() => pickReferral(c)}
												>
													<span class="font-medium text-text">{c.display_name}</span>
													{#if c.phone || c.email}
														<span class="mt-0.5 block truncate text-xs text-text-faint">
															{[c.phone, c.email].filter(Boolean).join(' · ')}
														</span>
													{/if}
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							{/if}
						{/if}
					</div>
				{/if}
			{/if}
			<label class="flex items-center gap-2 text-sm text-text">
				<input type="checkbox" bind:checked={is_internal} class="size-4 rounded border-border" />
				{t('contacts.form.internalStaff')}
			</label>
			<div>
				<label class={labelClass} for="c-notes">{t('contacts.form.notes')}</label>
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
				>{t('common.cancel')}</Button
			>
			<Button type="submit" form="contact-form" disabled={saving || !canSubmit}>
				{saving ? t('common.saving') : isEdit ? t('common.save') : t('common.create')}
			</Button>
		{/if}
	{/snippet}
</Dialog>

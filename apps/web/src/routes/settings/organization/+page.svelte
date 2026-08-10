<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { Tenant, TenantUpdate, SupportedCurrency, TenantTimezone } from '@verimaya/shared';
	import { SUPPORTED_CURRENCIES, TENANT_TIMEZONES } from '@verimaya/shared';
	import { t } from '$lib/i18n/locale.svelte';
	import { apiGet, apiSend, fieldClass, labelClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDate } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { MessageKey } from '$lib/i18n/messages';

	function timezoneOptionLabel(tz: TenantTimezone): string {
		const key: Record<TenantTimezone, MessageKey> = {
			'Europe/Istanbul': 'settings.organization.tzEuropeIstanbul',
			'Asia/Riyadh': 'settings.organization.tzAsiaRiyadh',
			'Europe/London': 'settings.organization.tzEuropeLondon',
			UTC: 'settings.organization.tzUtc'
		};
		return t(key[tz]);
	}

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>('/v1/tenants/current'),
		enabled: qs.ready
	}));

	let name = $state('');
	let baseCurrency = $state<SupportedCurrency>('TRY');
	let patientsLabel = $state('Hastalar');
	let timezone = $state<TenantTimezone>('Europe/Istanbul');
	let hydratedFor = $state<string | null>(null);

	function hydrateFrom(tenant: Tenant) {
		name = tenant.name;
		baseCurrency = tenant.base_currency;
		patientsLabel = tenant.contacts_section_label;
		timezone = (TENANT_TIMEZONES as readonly string[]).includes(tenant.timezone)
			? (tenant.timezone as TenantTimezone)
			: 'Europe/Istanbul';
		hydratedFor = tenant.id;
	}

	$effect(() => {
		const tenant = tenantQuery.data;
		if (tenant && hydratedFor !== tenant.id) {
			hydrateFrom(tenant);
		}
	});

	const currencyLocked = $derived(tenantQuery.data?.base_currency_locked === true);

	let saving = $state(false);
	let error = $state<string | null>(null);
	let savedAt = $state<number | null>(null);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		error = null;
		savedAt = null;
		const payload: TenantUpdate = {
			name: name.trim(),
			contacts_section_label: patientsLabel.trim() || 'Hastalar',
			timezone
		};
		if (!currencyLocked) {
			payload.base_currency = baseCurrency;
		}
		try {
			const updated = await apiSend<Tenant>('/v1/tenants/current', 'PATCH', payload);
			queryClient.setQueryData(qs.keys.tenants.current(), updated);
			hydrateFrom(updated);
			savedAt = Date.now();
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.organization.saveFailed');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.organization.title')} · {t('nav.settings')} · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title={t('settings.organization.title')}
		description={t('settings.organization.description')}
	/>

	{#if tenantQuery.isPending}
		<p class="text-sm text-text-muted">{t('settings.organization.loading')}</p>
	{:else if tenantQuery.isError}
		<p class="text-sm text-danger">{t('settings.organization.loadError')}</p>
	{:else if tenantQuery.data}
		<form class="rounded-lg border border-border bg-surface p-4 sm:p-6" onsubmit={save}>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="sm:col-span-2">
					<label class={labelClass} for="tenant-name">{t('settings.organization.name')}</label>
					<input id="tenant-name" class={fieldClass} bind:value={name} required maxlength="255" />
				</div>

				<div>
					<label class={labelClass} for="tenant-currency"
						>{t('settings.organization.currency')}</label
					>
					<select
						id="tenant-currency"
						class={fieldClass}
						bind:value={baseCurrency}
						disabled={currencyLocked}
					>
						{#each SUPPORTED_CURRENCIES as c (c)}
							<option value={c}>{c}</option>
						{/each}
					</select>
					{#if currencyLocked}
						<p class="mt-1 text-xs text-text-faint">
							{t('settings.organization.baseCurrencyLocked')}
						</p>
					{/if}
				</div>

				<div>
					<label class={labelClass} for="tenant-timezone"
						>{t('settings.organization.timezone')}</label
					>
					<select id="tenant-timezone" class={fieldClass} bind:value={timezone}>
						{#each TENANT_TIMEZONES as tz (tz)}
							<option value={tz}>{timezoneOptionLabel(tz)}</option>
						{/each}
					</select>
					<p class="mt-1 text-xs text-text-faint">{t('settings.organization.timezoneHint')}</p>
				</div>

				<div>
					<label class={labelClass} for="tenant-patients-label"
						>{t('settings.organization.patientsLabel')}</label
					>
					<input
						id="tenant-patients-label"
						class={fieldClass}
						bind:value={patientsLabel}
						maxlength="50"
						placeholder="Hastalar"
					/>
					<p class="mt-1 text-xs text-text-faint">
						{t('settings.organization.patientsLabelHint')}
					</p>
				</div>
			</div>

			<div class="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
				<Button type="submit" disabled={saving}>
					{saving ? t('common.saving') : t('common.save')}
				</Button>
				{#if savedAt}
					<span class="text-sm text-success">Kaydedildi.</span>
				{/if}
				{#if error}
					<span class="text-sm text-danger">{error}</span>
				{/if}
			</div>
		</form>

		<div class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
			<h2 class="text-sm font-semibold text-text">Tenant bilgisi</h2>
			<dl class="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
				<div class="flex justify-between gap-4 sm:block">
					<dt class="text-xs text-text-muted">Slug</dt>
					<dd class="font-mono text-xs text-text sm:mt-1">{tenantQuery.data.slug}</dd>
				</div>
				<div class="flex justify-between gap-4 sm:block">
					<dt class="text-xs text-text-muted">{t('settings.organization.createdAt')}</dt>
					<dd class="text-xs text-text sm:mt-1">{formatDate(tenantQuery.data.created_at)}</dd>
				</div>
			</dl>
			<p class="mt-3 text-xs text-text-faint">
				{#each t( 'settings.organization.slugFootnote', { link: '\u0001' } ).split('\u0001') as part, i (i)}
					{#if i > 0}<a href="/settings/team" class="text-brand hover:underline">Ekip</a>{/if}{part}
				{/each}
			</p>
		</div>
	{/if}
</div>

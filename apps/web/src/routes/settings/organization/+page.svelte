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
	const { keys, ready } = useQueryScope();

	const tenantQuery = createQuery(() => ({
		queryKey: keys.tenants.current(),
		queryFn: () => apiGet<Tenant>('/v1/tenants/current'),
		enabled: ready
	}));

	let name = $state('');
	let baseCurrency = $state<SupportedCurrency>('TRY');
	let patientsLabel = $state('Hastalar');
	let timezone = $state<TenantTimezone>('Europe/Istanbul');
	let hydratedFor = $state<string | null>(null);

	$effect(() => {
		const t = tenantQuery.data;
		if (t && hydratedFor !== t.id) {
			name = t.name;
			baseCurrency = t.base_currency;
			patientsLabel = t.patients_section_label;
			timezone = t.timezone;
			hydratedFor = t.id;
		}
	});

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
			base_currency: baseCurrency,
			patients_section_label: patientsLabel.trim() || 'Hastalar',
			timezone
		};
		try {
			await apiSend<Tenant>('/v1/tenants/current', 'PATCH', payload);
			await queryClient.invalidateQueries({ queryKey: keys.tenants.current() });
			savedAt = Date.now();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Kaydetme başarısız';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Organizasyon · Ayarlar · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader title="Organizasyon" description="Firma profili ve varsayılanlar." />

	{#if tenantQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if tenantQuery.isError}
		<p class="text-sm text-danger">Ayarlar yüklenemedi.</p>
	{:else if tenantQuery.data}
		<form class="rounded-lg border border-border bg-surface p-4 sm:p-6" onsubmit={save}>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="sm:col-span-2">
					<label class={labelClass} for="tenant-name">Firma adı</label>
					<input id="tenant-name" class={fieldClass} bind:value={name} required maxlength="255" />
				</div>

				<div>
					<label class={labelClass} for="tenant-currency">Varsayılan para birimi</label>
					<select id="tenant-currency" class={fieldClass} bind:value={baseCurrency}>
						{#each SUPPORTED_CURRENCIES as c (c)}
							<option value={c}>{c}</option>
						{/each}
					</select>
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
					<label class={labelClass} for="tenant-patients-label">"Hastalar" bölüm etiketi</label>
					<input
						id="tenant-patients-label"
						class={fieldClass}
						bind:value={patientsLabel}
						maxlength="50"
						placeholder="Hastalar"
					/>
					<p class="mt-1 text-xs text-text-faint">
						Örn. diş kliniği "Hastalar", acente "Misafirler" diyebilir.
					</p>
				</div>
			</div>

			<div class="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
				<Button type="submit" disabled={saving}>
					{saving ? 'Kaydediliyor…' : 'Kaydet'}
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
					<dt class="text-xs text-text-muted">Oluşturulma</dt>
					<dd class="text-xs text-text sm:mt-1">{formatDate(tenantQuery.data.created_at)}</dd>
				</div>
			</dl>
			<p class="mt-3 text-xs text-text-faint">
				Slug değiştirilemez. Üye ve rol yönetimi <a
					href="/settings/team"
					class="text-brand hover:underline">Ekip</a
				> sayfasında.
			</p>
		</div>
	{/if}
</div>

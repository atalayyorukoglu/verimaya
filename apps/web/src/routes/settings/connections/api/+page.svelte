<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		ApiKey,
		ApiKeyCreated,
		ApiKeyScope,
		WebhookEventType,
		WebhookSubscription
	} from '@verimaya/shared';
	import { apiPaths, webhookEventTypeSchema } from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass, labelClass } from '$lib/api';
	import { formatDateTime } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Webhook from '@lucide/svelte/icons/webhook';

	const queryClient = useQueryClient();
	const scopeLabels: Record<ApiKeyScope, string> = { read: 'Okuma', write: 'Yazma' };
	const webhookEventLabels: Record<WebhookEventType, string> = {
		'transaction.created': 'İşlem oluşturuldu',
		'transaction.updated': 'İşlem güncellendi',
		'patient.created': 'Hasta oluşturuldu',
		'appointment.created': 'Randevu oluşturuldu'
	};
	const webhookEventTypes = webhookEventTypeSchema.options;

	const keysQuery = createQuery(() => ({
		queryKey: ['settings', 'api-keys'],
		queryFn: () => apiGet<{ items: ApiKey[] }>(apiPaths.apiKeys)
	}));

	const items = $derived(keysQuery.data?.items ?? []);

	const webhooksQuery = createQuery(() => ({
		queryKey: ['settings', 'webhook-subscriptions'],
		queryFn: () => apiGet<{ items: WebhookSubscription[] }>(apiPaths.webhookSubscriptions)
	}));

	const webhookItems = $derived(webhooksQuery.data?.items ?? []);

	let dialogOpen = $state(false);
	let formName = $state('');
	let formScopes = $state<ApiKeyScope[]>(['read']);
	let saving = $state(false);
	let formError = $state<string | null>(null);
	let createdKey = $state<ApiKeyCreated | null>(null);

	function openCreate() {
		formName = '';
		formScopes = ['read'];
		formError = null;
		createdKey = null;
		dialogOpen = true;
	}

	function toggleScope(scope: ApiKeyScope) {
		formScopes = formScopes.includes(scope)
			? formScopes.filter((s) => s !== scope)
			: [...formScopes, scope];
	}

	async function save(e: Event) {
		e.preventDefault();
		const name = formName.trim();
		if (!name || formScopes.length === 0) return;
		saving = true;
		formError = null;
		try {
			const created = await apiSend<ApiKeyCreated>(apiPaths.apiKeys, 'POST', {
				name,
				scopes: formScopes
			});
			createdKey = created;
			await queryClient.invalidateQueries({ queryKey: ['settings', 'api-keys'] });
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Kayıt başarısız';
		} finally {
			saving = false;
		}
	}

	async function revoke(key: ApiKey) {
		if (!confirm(`“${key.name}” anahtarı iptal edilsin mi? Bu işlem geri alınamaz.`)) return;
		await apiSend(apiPaths.apiKey(key.id), 'DELETE');
		await queryClient.invalidateQueries({ queryKey: ['settings', 'api-keys'] });
	}

	async function copyKey() {
		if (!createdKey) return;
		try {
			await navigator.clipboard.writeText(createdKey.key);
		} catch {
			/* clipboard erişimi yoksa kullanıcı manuel kopyalar */
		}
	}

	let webhookDialogOpen = $state(false);
	let webhookFormUrl = $state('');
	let webhookFormSecret = $state('');
	let webhookFormEventTypes = $state<WebhookEventType[]>([]);
	let webhookSaving = $state(false);
	let webhookFormError = $state<string | null>(null);

	function openWebhookCreate() {
		webhookFormUrl = '';
		webhookFormSecret = '';
		webhookFormEventTypes = [];
		webhookFormError = null;
		webhookDialogOpen = true;
	}

	function toggleWebhookEventType(eventType: WebhookEventType) {
		webhookFormEventTypes = webhookFormEventTypes.includes(eventType)
			? webhookFormEventTypes.filter((e) => e !== eventType)
			: [...webhookFormEventTypes, eventType];
	}

	async function saveWebhook(e: Event) {
		e.preventDefault();
		const url = webhookFormUrl.trim();
		const secret = webhookFormSecret.trim();
		if (!url || secret.length < 16 || webhookFormEventTypes.length === 0) return;
		webhookSaving = true;
		webhookFormError = null;
		try {
			await apiSend(apiPaths.webhookSubscriptions, 'POST', {
				url,
				secret,
				event_types: webhookFormEventTypes
			});
			webhookDialogOpen = false;
			await queryClient.invalidateQueries({ queryKey: ['settings', 'webhook-subscriptions'] });
		} catch (err) {
			webhookFormError = err instanceof Error ? err.message : 'Kayıt başarısız';
		} finally {
			webhookSaving = false;
		}
	}

	async function removeWebhook(subscription: WebhookSubscription) {
		if (!confirm(`“${subscription.url}” için abonelik silinsin mi? Bu işlem geri alınamaz.`)) return;
		await apiSend(apiPaths.webhookSubscription(subscription.id), 'DELETE');
		await queryClient.invalidateQueries({ queryKey: ['settings', 'webhook-subscriptions'] });
	}
</script>

<svelte:head>
	<title>n8n / API · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title="n8n / API"
		description="Scope'lu API anahtarları ve outbox üzerinden giden webhook'lar."
	>
		{#snippet actions()}
			<Button type="button" size="sm" onclick={openCreate}>
				<Plus class="size-3.5" />
				Anahtar oluştur
			</Button>
		{/snippet}
	</PageHeader>

	<div class="space-y-4">
		<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<h2 class="text-sm font-semibold text-text">API anahtarları</h2>
					<p class="mt-1 text-sm leading-relaxed text-text-muted">
						Tenant'a özel, scope'lu anahtarlar. Anahtar yalnızca oluşturma anında bir kez gösterilir.
					</p>
				</div>
			</div>

			{#if keysQuery.isPending}
				<p class="mt-4 text-sm text-text-muted">Yükleniyor…</p>
			{:else if keysQuery.isError}
				<p class="mt-4 text-sm text-danger">Anahtarlar yüklenemedi.</p>
			{:else if items.length === 0}
				<div class="mt-4 flex flex-col items-center gap-2 py-4 text-center">
					<span
						class="flex size-10 items-center justify-center rounded-full bg-surface-2 text-text-muted"
					>
						<KeyRound class="size-5" />
					</span>
					<p class="text-sm font-medium text-text">Henüz aktif anahtar yok</p>
					<Button class="mt-2" type="button" size="sm" onclick={openCreate}>İlk anahtarı oluştur</Button
					>
				</div>
			{:else}
				<ul class="mt-4 divide-y divide-border">
					{#each items as key (key.id)}
						<li class="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-text">{key.name}</p>
								<p class="mt-0.5 font-mono text-xs text-text-faint">{key.key_prefix}…</p>
								<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
									{#each key.scopes as scope (scope)}
										<span
											class="rounded-[4px] bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
										>
											{scopeLabels[scope]}
										</span>
									{/each}
									<span class="text-xs text-text-faint">· {formatDateTime(key.created_at)}</span>
								</div>
							</div>
							<button
								type="button"
								class="shrink-0 cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger"
								aria-label="Anahtarı iptal et"
								onclick={() => revoke(key)}
							>
								<Trash2 class="size-3.5" />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<h2 class="text-sm font-semibold text-text">Giden webhook'lar</h2>
					<p class="mt-1 text-sm leading-relaxed text-text-muted">
						Seçili olaylar outbox tablosundan <code class="text-text">X-Verimaya-Signature</code>
						(HMAC-SHA256) ile imzalanarak hedef URL'e iletilir; başarısız teslimat yeniden denenir.
					</p>
				</div>
				<Button type="button" size="sm" onclick={openWebhookCreate}>
					<Plus class="size-3.5" />
					Abonelik ekle
				</Button>
			</div>

			{#if webhooksQuery.isPending}
				<p class="mt-4 text-sm text-text-muted">Yükleniyor…</p>
			{:else if webhooksQuery.isError}
				<p class="mt-4 text-sm text-danger">Abonelikler yüklenemedi.</p>
			{:else if webhookItems.length === 0}
				<div class="mt-4 flex flex-col items-center gap-2 py-4 text-center">
					<span
						class="flex size-10 items-center justify-center rounded-full bg-surface-2 text-text-muted"
					>
						<Webhook class="size-5" />
					</span>
					<p class="text-sm font-medium text-text">Henüz abonelik yok</p>
					<Button class="mt-2" type="button" size="sm" onclick={openWebhookCreate}
						>İlk aboneliği ekle</Button
					>
				</div>
			{:else}
				<ul class="mt-4 divide-y divide-border">
					{#each webhookItems as subscription (subscription.id)}
						<li class="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-text">{subscription.url}</p>
								<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
									{#each subscription.event_types as eventType (eventType)}
										<span
											class="rounded-[4px] bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
										>
											{webhookEventLabels[eventType as WebhookEventType] ?? eventType}
										</span>
									{/each}
									<span class="text-xs text-text-faint"
										>· {formatDateTime(subscription.created_at)}</span
									>
								</div>
							</div>
							<button
								type="button"
								class="shrink-0 cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger"
								aria-label="Aboneliği sil"
								onclick={() => removeWebhook(subscription)}
							>
								<Trash2 class="size-3.5" />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<p class="text-xs text-text-faint">
			API sözleşmesi <code class="text-text">packages/shared</code> içindeki zod şemalarından üretilir.
		</p>
	</div>
</div>

<Dialog bind:open={dialogOpen} title={createdKey ? 'Anahtar oluşturuldu' : 'Yeni API anahtarı'}>
	{#if createdKey}
		<div class="space-y-3">
			<p class="text-sm text-text-muted">
				Bu anahtarı şimdi kopyalayın — bir daha gösterilmeyecek.
			</p>
			<div class="flex items-center gap-2 rounded-[6px] border border-border bg-surface-2 p-2">
				<code class="min-w-0 flex-1 truncate text-xs text-text">{createdKey.key}</code>
				<Button type="button" size="sm" variant="outline" onclick={copyKey}>Kopyala</Button>
			</div>
			<div class="flex justify-end">
				<Button type="button" onclick={() => (dialogOpen = false)}>Kapat</Button>
			</div>
		</div>
	{:else}
		<form class="grid gap-3" onsubmit={save}>
			{#if formError}
				<p class="text-sm text-danger">{formError}</p>
			{/if}
			<label class="grid gap-1">
				<span class={labelClass}>Ad</span>
				<input
					class={fieldClass}
					bind:value={formName}
					required
					maxlength="120"
					placeholder="ör. n8n entegrasyonu"
				/>
			</label>
			<fieldset class="grid gap-1.5">
				<span class={labelClass}>Scope</span>
				<label class="flex items-center gap-2 text-sm text-text">
					<input
						type="checkbox"
						checked={formScopes.includes('read')}
						onchange={() => toggleScope('read')}
					/>
					Okuma
				</label>
				<label class="flex items-center gap-2 text-sm text-text">
					<input
						type="checkbox"
						checked={formScopes.includes('write')}
						onchange={() => toggleScope('write')}
					/>
					Yazma
				</label>
			</fieldset>
			<div class="mt-2 flex justify-end gap-2">
				<Button type="button" variant="outline" onclick={() => (dialogOpen = false)}>İptal</Button>
				<Button type="submit" disabled={saving || formScopes.length === 0}>
					{saving ? 'Oluşturuluyor…' : 'Oluştur'}
				</Button>
			</div>
		</form>
	{/if}
</Dialog>

<Dialog bind:open={webhookDialogOpen} title="Yeni webhook aboneliği">
	<form class="grid gap-3" onsubmit={saveWebhook}>
		{#if webhookFormError}
			<p class="text-sm text-danger">{webhookFormError}</p>
		{/if}
		<label class="grid gap-1">
			<span class={labelClass}>Hedef URL</span>
			<input
				class={fieldClass}
				type="url"
				bind:value={webhookFormUrl}
				required
				maxlength="2048"
				placeholder="https://n8n.example.com/webhook/verimaya"
			/>
		</label>
		<label class="grid gap-1">
			<span class={labelClass}>Paylaşılan gizli anahtar (secret)</span>
			<input
				class={fieldClass}
				type="text"
				bind:value={webhookFormSecret}
				required
				minlength="16"
				maxlength="500"
				placeholder="En az 16 karakter"
			/>
			<span class="text-xs text-text-faint">
				İmza doğrulaması için kullanılır; kaydedildikten sonra bir daha gösterilmez.
			</span>
		</label>
		<fieldset class="grid gap-1.5">
			<span class={labelClass}>Olay türleri</span>
			{#each webhookEventTypes as eventType (eventType)}
				<label class="flex items-center gap-2 text-sm text-text">
					<input
						type="checkbox"
						checked={webhookFormEventTypes.includes(eventType)}
						onchange={() => toggleWebhookEventType(eventType)}
					/>
					{webhookEventLabels[eventType]}
				</label>
			{/each}
		</fieldset>
		<div class="mt-2 flex justify-end gap-2">
			<Button type="button" variant="outline" onclick={() => (webhookDialogOpen = false)}
				>İptal</Button
			>
			<Button
				type="submit"
				disabled={webhookSaving ||
					webhookFormEventTypes.length === 0 ||
					webhookFormSecret.trim().length < 16 ||
					!webhookFormUrl.trim()}
			>
				{webhookSaving ? 'Oluşturuluyor…' : 'Oluştur'}
			</Button>
		</div>
	</form>
</Dialog>

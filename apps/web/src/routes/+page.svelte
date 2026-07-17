<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { Tenant } from '@verimaya/shared';

	const tenantQuery = createQuery(() => ({
		queryKey: ['tenants', 'current'],
		queryFn: async (): Promise<Tenant> => {
			const res = await fetch('/v1/tenants/current');
			if (!res.ok) throw new Error('Tenant yüklenemedi');
			return res.json();
		}
	}));
</script>

<div class="mx-auto max-w-5xl space-y-6">
	<div>
		<h1 class="text-text text-xl font-semibold tracking-tight">Panel</h1>
		<p class="text-text-muted mt-1 text-sm">
			Kaldığın yerden devam et — ekranlar Faz 0a boyunca doldurulacak.
		</p>
	</div>

	{#if tenantQuery.isPending}
		<p class="text-text-muted text-sm">Tenant bilgisi yükleniyor…</p>
	{:else if tenantQuery.isError}
		<p class="text-danger text-sm">Tenant yüklenemedi (MSW kontrol edin).</p>
	{:else if tenantQuery.data}
		<p class="text-text-muted text-sm">
			Aktif tenant: <span class="text-text font-medium">{tenantQuery.data.name}</span>
			· {tenantQuery.data.base_currency}
		</p>
	{/if}

	<div class="grid gap-4 sm:grid-cols-3">
		<section class="border-border bg-surface rounded-lg border p-4">
			<h2 class="text-text text-sm font-semibold">Son hastalar</h2>
			<p class="text-text-faint mt-2 text-sm">Henüz kayıt yok.</p>
		</section>
		<section class="border-border bg-surface rounded-lg border p-4">
			<h2 class="text-text text-sm font-semibold">Bugünün randevuları</h2>
			<p class="text-text-faint mt-2 text-sm">Henüz kayıt yok.</p>
		</section>
		<section class="border-border bg-surface rounded-lg border p-4">
			<h2 class="text-text text-sm font-semibold">Son mesajlar</h2>
			<p class="text-text-faint mt-2 text-sm">Henüz kayıt yok.</p>
		</section>
	</div>
</div>

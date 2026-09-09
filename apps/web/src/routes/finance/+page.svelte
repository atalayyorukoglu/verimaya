<script lang="ts">
	import { createInfiniteQuery, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { bridgePeriod, type PeriodRegistration } from '$lib/period-bridge.svelte';
	import PeriodControl from '$lib/components/PeriodControl.svelte';
	import { debounced } from '$lib/debounced.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import { monthRangeInTz, type PeriodKey } from '$lib/period-range';
	import type {
		ContractResponse,
		FinanceCategory,
		InboundMessage,
		SupportedCurrency,
		Tenant,
		Transaction,
		TransactionCreate,
		TransactionKind,
		TransactionStatus,
		TransactionUpdate
	} from '@verimaya/shared';
	import {
		apiPaths,
		deriveTransactionLines,
		listUrl,
		transactionKindLabels,
		transactionKindSchema,
		transactionStatusLabels,
		transactionStatusSchema
	} from '@verimaya/shared';
	import { apiGet, apiSend, filterFieldClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDate, formatMoney } from '$lib/format';
	import { amountInBase } from '$lib/money-base';
	import { t } from '$lib/i18n/locale.svelte';
	import { transactionStatusTone } from '$lib/status-tone';
	import BalancesPanel from '$lib/components/BalancesPanel.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import TransactionFormDialog from '$lib/components/TransactionFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';

	type TransactionsPage = ContractResponse<'GET /v1/transactions'>;
	type ContactsPage = ContractResponse<'GET /v1/contacts'>;

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const contactFilterId = $derived(page.url.searchParams.get('contact'));
	const caseContactFilterId = $derived(page.url.searchParams.get('case_contact'));

	let qInput = $state('');
	/*
	 * Yazarken arar: Enter ve "Uygula" kalktı (kullanıcı, 2026-09-08). Tür/durum
	 * seçicileri ve dönem zaten anında uygulanıyordu; arama alanı da 300ms
	 * gecikmeyle onlara katıldı, formda uygulanacak bir şey kalmadı.
	 */
	const q = debounced(() => qInput);
	const appliedQ = $derived(q.value.trim());
	/*
	 * Kategori artık seçmeli (kullanıcı, 2026-09-09): tam adı elle yazmak
	 * gerekiyordu, bir harf şaşınca sonuç boş dönüyordu. Sunucu süzgeci zaten
	 * ada göre birebir eşleşme istiyor — listeden seçmek onu garanti ediyor.
	 * Gecikmeye gerek yok, seçim anında uygulanır.
	 */
	let category = $state('');
	const appliedCategory = $derived(category);
	let kind = $state('');
	let status = $state('');
	let from = $state('');
	let to = $state('');

	let formOpen = $state(false);
	let editing = $state<Transaction | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	const categoriesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.financeCategories(),
		queryFn: () => apiGet<{ items: FinanceCategory[] }>(apiPaths.settingsFinanceCategories),
		enabled: qs.ready
	}));

	/*
	 * Tür seçiliyse yalnız o türün kategorileri listelenir — gelir süzgecinde
	 * gider kategorisi seçmek boş liste demek. Adlar iki türde de geçebildiği
	 * için tekilleştiriliyor; sunucu süzgeci ada bakıyor, id'ye değil.
	 */
	const categoryOptions = $derived([
		...new Set(
			(categoriesQuery.data?.items ?? [])
				.filter((c) => !kind || c.kind === kind)
				.toSorted((a, b) => a.sort_order - b.sort_order)
				.map((c) => c.name)
		)
	]);

	/*
	 * Filtre satırında seçiciler sağ yarımı paylaşır. Paylaşılan `filterFieldClass`
	 * `lg:w-40 lg:flex-none` taşıyor; o sabit genişlik yüzünden üçü yarımın solunda
	 * toplanıp 224px boşluk bırakıyordu (kullanıcı, 2026-09-09). Yarıçap da bu
	 * satırdaki diğer yüzeylerle eşitlendi: 6px yerine 8px.
	 */
	const halfFilterFieldClass = filterFieldClass
		.replace('lg:w-40', 'lg:w-auto')
		.replace('lg:flex-none', 'lg:flex-1')
		.replace('rounded-[6px]', 'rounded-[8px]');

	const kindOptions = $derived(transactionKindSchema.options);
	const statusOptions = $derived(transactionStatusSchema.options);

	const listFilters = $derived({
		contact_id: contactFilterId,
		case_contact_id: caseContactFilterId,
		q: appliedQ || undefined,
		kind: (kind || undefined) as TransactionKind | undefined,
		status: (status || undefined) as TransactionStatus | undefined,
		category: appliedCategory || undefined,
		from: from || undefined,
		to: to || undefined
	});

	const filtersActive = $derived(
		Boolean(
			appliedQ ||
			appliedCategory ||
			kind ||
			status ||
			from ||
			to ||
			contactFilterId ||
			caseContactFilterId
		)
	);

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>(apiPaths.tenantsCurrent),
		enabled: qs.ready
	}));

	const baseCurrency = $derived((tenantQuery.data?.base_currency ?? 'TRY') as SupportedCurrency);
	const tenantTimezone = $derived(tenantQuery.data?.timezone ?? 'Europe/Istanbul');

	/*
	 * Mobilde tarih seçimi kabuk başlığında (Randevular ile aynı desen). Bu sayfa
	 * `PeriodKey` tutmuyor, ham `from`/`to` tutuyor — köprüye o ikisi üzerinden
	 * bağlanıyor: aralık boşsa "tüm zamanlar", doluysa "özel". Aşağıdaki iki tarih
	 * alanı mobilde gizli, masaüstünde açık.
	 */
	function setPeriodKey(next: PeriodKey) {
		if (next === 'tum') {
			from = '';
			to = '';
			return;
		}
		const r = monthRangeInTz(next === 'gecen-ay' ? -1 : 0, tenantTimezone);
		from = r.from;
		to = r.to;
	}

	function setPeriodRange(nextFrom: string, nextTo: string) {
		from = nextFrom;
		to = nextTo;
	}

	const periodRegistration = $derived({
		key: (from || to ? 'ozel' : 'tum') as PeriodKey,
		from,
		to,
		timeZone: tenantTimezone,
		setKey: setPeriodKey,
		setRange: setPeriodRange
	});

	bridgePeriod(() => periodRegistration);

	/* Sayfa içi denetim köprüden değil doğrudan bu kayıttan beslenir (rota
	 * geçişinin ilk karesinde köprü `null` dönüyor). */
	const localPeriod = $derived<PeriodRegistration>({
		...periodRegistration,
		path: page.url.pathname
	});

	/** Base equivalent only when txn currency differs and snapshot exists. */
	function baseLine(tx: Transaction): string | null {
		if (tx.currency === baseCurrency) return null;
		const base = amountInBase(tx, baseCurrency);
		if (base == null) return null;
		const sign = tx.kind === 'expense' ? '−' : '';
		return `${sign}${formatMoney(base, baseCurrency)}`;
	}

	const txQuery = createInfiniteQuery(() => ({
		queryKey: qs.keys.transactions.list(listFilters),
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<TransactionsPage>(
				listUrl('transactions', {
					limit: 25,
					cursor: pageParam,
					contact_id: listFilters.contact_id,
					case_contact_id: listFilters.case_contact_id,
					q: listFilters.q,
					kind: listFilters.kind,
					status: listFilters.status,
					category: listFilters.category,
					from: listFilters.from,
					to: listFilters.to
				})
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last: TransactionsPage) => last.next_cursor,
		enabled: qs.ready
	}));

	const contactsQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.list({ limit: 100, for: 'picker' }),
		queryFn: () => apiGet<ContactsPage>(listUrl('contacts', { limit: 100 })),
		enabled: qs.ready
	}));

	const filterContact = $derived(
		contactFilterId ? (contactsQuery.data?.items ?? []).find((c) => c.id === contactFilterId) : null
	);
	const filterCaseContact = $derived(
		caseContactFilterId
			? (contactsQuery.data?.items ?? []).find((c) => c.id === caseContactFilterId)
			: null
	);

	const inboxQuery = createQuery(() => ({
		queryKey: qs.keys.whatsapp.inbox(),
		queryFn: () => apiGet<{ messages: InboundMessage[] }>(apiPaths.whatsappInbox),
		enabled: qs.ready
	}));

	const pendingCount = $derived(
		(inboxQuery.data?.messages ?? []).filter((m) => m.status === 'new').length
	);

	const items = $derived(txQuery.data?.pages.flatMap((p) => p.items) ?? []);
	const totalCount = $derived(txQuery.data?.pages[0]?.total_count);
	/*
	 * Sayaç geldiğinde yalnız sayaç yazılır. "Gelir ve gider kayıtları (tutarlar minor
	 * unit)." her açılışta aynı şeyi söylüyordu ve mobilde iki satır yiyip sayacı
	 * alt satıra itiyordu; "minor unit" zaten kullanıcı dili değil, geliştirici notu
	 * (kullanıcı, 2026-09-05). Açıklama yalnız sayaç henüz yokken (ilk yükleme)
	 * başlığın altını boş bırakmamak için kalıyor.
	 */
	const listDescription = $derived(
		totalCount == null
			? t('finance.description')
			: filtersActive
				? t('finance.list.totalFiltered', { count: String(totalCount) })
				: t('finance.list.total', { count: String(totalCount) })
	);

	/* Tür değişince o türde olmayan kategori seçili kalmasın — liste boş dönerdi. */
	$effect(() => {
		if (category && !categoryOptions.includes(category)) category = '';
	});

	function clearFilters() {
		qInput = '';
		category = '';
		// Bekleyen gecikmeli değer sonradan gelip temizliği geri almasın.
		q.reset('');
		kind = '';
		status = '';
		from = '';
		to = '';
	}

	function financeHref(name?: 'contact' | 'case_contact', value?: string): string {
		if (!name || !value) return '/finance';
		return `/finance?${name}=${encodeURIComponent(value)}`;
	}

	function openCreate() {
		editing = null;
		formOpen = true;
	}

	function openEdit(tx: Transaction) {
		editing = tx;
		formOpen = true;
	}

	async function saveTransaction(data: TransactionCreate | TransactionUpdate) {
		saving = true;
		formError = null;
		try {
			if (editing) {
				await apiSend(apiPaths.transaction(editing.id), 'PATCH', data);
			} else {
				await apiSend(apiPaths.transactions, 'POST', data);
			}
			await queryClient.invalidateQueries({ queryKey: qs.keys.transactions.all() });
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('finance.saveFailed');
		} finally {
			saving = false;
		}
	}

	async function deleteTransaction() {
		if (!editing) return;
		saving = true;
		formError = null;
		try {
			await apiSend(apiPaths.transaction(editing.id), 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.transactions.all() });
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('finance.deleteFailed');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{t('finance.title')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<PageHeader title={t('finance.title')} description={listDescription}>
		{#snippet actions()}
			<!--
				Mobilde yan yana: ikisi de tek satırlık kısayol, alt alta durunca başlığın
				altını iki blok kaplıyordu (kullanıcı, 2026-09-05).
				Eşit pay (`flex-1`) verilmişti ama "AI ile işlem" ikon + rozetle birlikte
				o genişliğe sığmayıp iki satıra kırılıyordu; ikisi de artık içeriği kadar.
			-->
			<!--
				Mobilde Randevular deseni (kullanıcı, 2026-09-09): başlık bloğu üstte,
				düğmeler kendi satırında ve **soldan** başlar. `w-full` olmadan
				PageHeader'ın `justify-between`'i düğmeleri sağa itiyordu.
			-->
			<div
				class="flex w-full flex-row flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end"
			>
				<a
					href={resolve('/finance/ai-transaction')}
					class="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] border border-border bg-transparent px-3 text-sm font-medium whitespace-nowrap text-text hover:bg-surface-2 sm:h-9 sm:px-4"
				>
					<Sparkles class="size-4" />
					{t('finance.aiLink')}
					<!--
						Bekleyen sayısı gözden kaçıyordu (kullanıcı, 2026-09-09): sarı zemin
						üstüne normal metin rengi, düğmenin kendi çerçevesiyle karışıyordu.
						Kırmızı zemin + beyaz yazı: sayfadaki tek kırmızı bu, dikkat oraya gidiyor.
					-->
					{#if pendingCount > 0}
						<span
							class="inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums"
						>
							{pendingCount}
						</span>
					{/if}
				</a>
				<a
					href={resolve('/finance/commissions')}
					class="inline-flex h-11 items-center justify-center gap-2 rounded-[6px] border border-border bg-transparent px-3 text-sm font-medium whitespace-nowrap text-text hover:bg-surface-2 sm:h-9 sm:px-4"
				>
					{t('finance.commissionsLink')}
				</a>
				<!--
					"Yeni işlem" başlığa, Hakediş'in yanına alındı (kullanıcı, 2026-09-09).
					2026-09-05'te filtre satırındaki "+" ikonuna indirilmişti; oradan
					çıkınca mobil filtre satırında kategori seçicisine yer açıldı.
				-->
				<!--
					`ms-auto`: mobilde satır tam genişlik olduğu için birincil eylem sağ
					kenara yaslanır, AI/Hakediş solda kalır (kullanıcı, 2026-09-09).
					Masaüstünde blok zaten sağda, etkisi yok.
				-->
				<Button
					type="button"
					class="ms-auto h-11 shrink-0 px-3 sm:h-9 sm:px-4"
					aria-label={t('finance.new')}
					onclick={openCreate}
				>
					<Plus class="size-4" />
					<span>{t('finance.new')}</span>
				</Button>
			</div>
		{/snippet}
	</PageHeader>

	{#if contactFilterId}
		<div
			class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand-subtle px-3 py-2"
		>
			<p class="text-sm text-text">
				{t('finance.filter.contact')}
				<span class="font-medium">{filterContact?.display_name ?? contactFilterId.slice(0, 8)}</span
				>
			</p>
			<a
				href={resolve(financeHref('case_contact', caseContactFilterId ?? undefined) as '/finance')}
				class="inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text"
			>
				<X class="size-3.5" />
				{t('finance.filter.clearContact')}
			</a>
		</div>
	{/if}

	{#if caseContactFilterId}
		<div
			class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand-subtle px-3 py-2"
		>
			<p class="text-sm text-text">
				{t('finance.filter.patient')}
				<span class="font-medium"
					>{filterCaseContact?.display_name ?? caseContactFilterId.slice(0, 8)}</span
				>
			</p>
			<a
				href={resolve(financeHref('contact', contactFilterId ?? undefined) as '/finance')}
				class="inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text"
			>
				<X class="size-3.5" />
				{t('finance.filter.clearPatient')}
			</a>
		</div>
	{/if}

	<!--
		Dönem denetimi bakiye satırının soluna alındı (kullanıcı, 2026-09-08); filtre
		satırı zaten doluydu. `-mt-3` bakiye kartındaki aynı negatif boşluğu eşler —
		kart PageHeader'ın `mb-6`'sını 12px'e çekiyor, denetim de aynı hizada dursun.
		Mobilde gizli: orada aynısı kabuk başlığında.
	-->
	<div class="flex min-w-0 items-start gap-2">
		<PeriodControl
			period={localPeriod}
			class="-mt-3 shrink-0 max-md:hidden lg:w-[calc(50%-4px)] lg:max-w-none lg:shrink-0"
		/>
		<div class="min-w-0 flex-1 lg:w-[calc(50%-4px)] lg:flex-none">
			<BalancesPanel collapsible />
		</div>
	</div>

	<!--
		Mobilde üç seçici tek satırda: tür + durum + kategori. Arama üstte tam
		genişlik. "Yeni işlem" başlığa taşındığı için (2026-09-09) kategori buraya
		sığdı. Tüm filtreler anında uygulanır; arama 300ms gecikmeli.
	-->
	<!-- Alttaki ayraç: filtreler ile liste birbirine giriyordu. -->
	<div
		class="mb-4 flex min-w-0 flex-col gap-2 border-b border-border pb-4 lg:flex-row lg:flex-nowrap lg:items-end"
	>
		<!--
			`flex-1` YALNIZ `lg`'de: form mobilde `flex-col`, orada `flex-1` ana ekseni
			DİKEY yapıyor ve `flex-basis: 0` yüksekliği ele geçirip `h-11`'i eziyordu —
			arama kutusu 44px yerine 22px çıkıyordu, seçicilerin yarısı. Satır düzenine
			geçilen `lg`'de flex-1 yine genişliği paylaştırır.
		-->
		<input
			class="box-border h-11 w-full min-w-0 rounded-[8px] border border-border bg-surface px-3 text-base text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40 lg:h-9 lg:w-[calc(50%-4px)] lg:min-w-[9rem] lg:flex-none lg:text-sm"
			placeholder={t('finance.filter.qPlaceholder')}
			bind:value={qInput}
		/>
		<!--
			Masaüstünde satır iki eşit yarım (kullanıcı, 2026-09-09): solda arama,
			sağda tür/durum/kategori + Temizle. Genişlik `calc(50% - 4px)` — düz
			`w-1/2` iki yarım + 8px boşlukla %100'ü aşıyor, satırlardan biri 8px
			kayıyordu. `md:contents` orta genişlikte eski davranışı korur;
			`lg:flex` sarmalayıcıyı geri getirip yarımı kurar.
		-->
		<div
			class="flex min-w-0 flex-nowrap items-center gap-2 md:contents lg:flex lg:w-[calc(50%-4px)] lg:flex-none lg:items-end"
		>
			<select class={halfFilterFieldClass} bind:value={kind}>
				<option value="">{t('finance.filter.kindAll')}</option>
				{#each kindOptions as k (k)}
					<option value={k}>{transactionKindLabels[k]}</option>
				{/each}
			</select>
			<select class={halfFilterFieldClass} bind:value={status}>
				<option value="">{t('finance.filter.statusAll')}</option>
				{#each statusOptions as s (s)}
					<option value={s}>{transactionStatusLabels[s]}</option>
				{/each}
			</select>
			<select
				class={halfFilterFieldClass}
				aria-label={t('finance.filter.categoryPlaceholder')}
				bind:value={category}
			>
				<option value="">{t('finance.filter.categoryAll')}</option>
				{#each categoryOptions as name (name)}
					<option value={name}>{name}</option>
				{/each}
			</select>
			{#if appliedQ || appliedCategory || kind || status || from || to}
				<Button
					class="min-h-11 shrink-0 lg:min-h-9"
					type="button"
					variant="outline"
					onclick={clearFilters}>{t('finance.filter.clear')}</Button
				>
			{/if}
		</div>
	</div>

	{#if txQuery.isPending}
		<p class="text-sm text-text-muted">{t('finance.loading')}</p>
	{:else if txQuery.isError}
		<p class="text-sm text-danger">{t('finance.loadError')}</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">
				{filtersActive ? t('finance.emptyFiltered') : t('finance.empty')}
			</p>
			{#if !filtersActive}
				<Button class="mt-4" type="button" onclick={openCreate}>{t('finance.new')}</Button>
			{/if}
		</div>
	{:else}
		<div class="hidden min-w-0 overflow-hidden rounded-lg border border-border bg-surface md:block">
			<table class="w-full table-fixed text-left text-sm">
				<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
					<tr>
						<th class="w-[14%] px-4 py-3 font-medium">{t('finance.col.date')}</th>
						<th class="w-[36%] px-4 py-3 font-medium">{t('finance.col.label')}</th>
						<th class="w-[12%] px-4 py-3 font-medium">{t('finance.col.kind')}</th>
						<th class="w-[16%] px-4 py-3 font-medium">{t('finance.col.status')}</th>
						<th class="w-[22%] px-4 py-3 text-right font-medium">{t('finance.col.amount')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each items as tx (tx.id)}
						{@const baseAmt = baseLine(tx)}
						{@const lines = deriveTransactionLines(tx)}
						<tr
							class="cursor-pointer transition-colors hover:bg-surface-2/60"
							onclick={() => openEdit(tx)}
						>
							<td class="px-4 py-3 whitespace-nowrap text-text-muted"
								>{formatDate(tx.occurred_on)}</td
							>
							<td class="min-w-0 px-4 py-3">
								<p class="truncate font-medium text-text">{lines.primary}</p>
								<p class="truncate text-xs text-text-faint">{lines.secondary}</p>
								{#if tx.description?.trim()}
									<!-- Uzun açıklama satır yüksekliğini patlatmasın: tek satırda kesilir. -->
									<p class="truncate text-xs text-text-muted">
										<span class="font-medium">{t('finance.card.description')}:</span>
										<span class="text-text-faint">{tx.description.trim()}</span>
									</p>
								{/if}
							</td>
							<td class="px-4 py-3 text-text-muted">{transactionKindLabels[tx.kind]}</td>
							<td class="px-4 py-3">
								<StatusBadge
									label={transactionStatusLabels[tx.status]}
									tone={transactionStatusTone(tx.status)}
								/>
							</td>
							<td
								class="px-4 py-3 text-right font-medium tabular-nums {tx.kind === 'income'
									? 'text-success'
									: 'text-text'}"
							>
								<p>
									{tx.kind === 'expense' ? '−' : ''}{formatMoney(tx.amount, tx.currency)}
								</p>
								{#if baseAmt}
									<p class="text-xs font-normal text-text-faint">{baseAmt}</p>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<ul class="space-y-2 md:hidden">
			{#each items as tx (tx.id)}
				{@const baseAmt = baseLine(tx)}
				{@const lines = deriveTransactionLines(tx)}
				<li class="min-w-0">
					<button
						type="button"
						class="w-full min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4 text-left"
						onclick={() => openEdit(tx)}
					>
						<div class="flex min-w-0 items-start justify-between gap-2">
							<div class="min-w-0 flex-1 overflow-hidden">
								<p class="truncate text-sm font-medium text-text">{lines.primary}</p>
								<p class="truncate text-xs text-text-faint">{lines.secondary}</p>
								{#if tx.description?.trim()}
									<p class="line-clamp-2 text-xs text-text-muted">
										<span class="font-medium">{t('finance.card.description')}:</span>
										<span class="text-text-faint">{tx.description.trim()}</span>
									</p>
								{/if}
								<p class="text-xs text-text-faint">{formatDate(tx.occurred_on)}</p>
							</div>
							<div class="shrink-0 text-right">
								<p
									class="text-sm font-semibold tabular-nums {tx.kind === 'income'
										? 'text-success'
										: 'text-text'}"
								>
									{tx.kind === 'expense' ? '−' : ''}{formatMoney(tx.amount, tx.currency)}
								</p>
								{#if baseAmt}
									<p class="text-xs text-text-faint tabular-nums">{baseAmt}</p>
								{/if}
							</div>
						</div>
						<div class="mt-2">
							<StatusBadge
								label={transactionStatusLabels[tx.status]}
								tone={transactionStatusTone(tx.status)}
							/>
						</div>
					</button>
				</li>
			{/each}
		</ul>

		{#if txQuery.hasNextPage}
			<div class="mt-4 flex justify-center">
				<Button
					variant="outline"
					type="button"
					disabled={txQuery.isFetchingNextPage}
					onclick={() => txQuery.fetchNextPage()}
				>
					{txQuery.isFetchingNextPage ? t('finance.loadingMore') : t('finance.loadMore')}
				</Button>
			</div>
		{/if}
	{/if}
</div>

<TransactionFormDialog
	bind:open={formOpen}
	transaction={editing}
	defaultContactId={contactFilterId}
	{saving}
	error={formError}
	onsubmit={saveTransaction}
	ondelete={editing ? deleteTransaction : undefined}
/>

<script lang="ts">
	/*
	 * Mobil başlıktaki kompakt dönem denetimi: `‹ Eylül 2026 ˅ ›`.
	 *
	 * Aramanın alt menüye taşınmasıyla boşalan yeri doldurur (kullanıcı, 2026-09-05).
	 * Sayfadaki `PeriodSelector` mobilde gizli; ikisi aynı durumu paylaşır — sayfa
	 * kendini `period-bridge`'e kaydeder, buradaki denetim onun setter'larını çağırır.
	 * Dönemi olmayan sayfada kayıt yoktur ve bu bileşen hiç render edilmez.
	 *
	 * Oklar ay ay ilerletir; etikete basınca panel açılır (Bu aya git / başlangıç /
	 * bitiş / tüm zamanlar).
	 *
	 * Kap 44px: mobilde global dokunma hedefi kuralı (`layout.css`) butonlara
	 * `min-height: 44px` veriyor. Kap 36px kalınca butonlar taşıyor ve ayraç çizgileri
	 * yuvarlak köşelerin dışına çıkıyordu. Kuraldan muaf tutmak yerine (ok tuşları
	 * gerçekten parmakla basılıyor) kap hedefe uyduruldu.
	 *
	 * Panel `portal` ile `document.body`'ye taşınır. `fixed` tek başına yetmiyor:
	 * başlıkta `backdrop-blur` var ve `backdrop-filter` sabit konumlu torunlar için
	 * kapsayıcı blok yaratıyor — panel başlığın içine hapsolup `overflow` tarafından
	 * kırpılıyordu, yani açılıyor ama görünmüyordu. CommandPalette de aynı sebeple
	 * portal kullanıyor (bkz. `actions/portal.ts`).
	 */
	import { activePeriod } from '$lib/period-bridge.svelte';
	import { monthRangeInTz } from '$lib/period-range';
	import { t } from '$lib/i18n/locale.svelte';
	import { fieldClass } from '$lib/api';
	import { portal } from '$lib/actions/portal';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	const period = $derived(activePeriod());

	let open = $state(false);
	let draftFrom = $state('');
	let draftTo = $state('');

	/** Panel açılınca taslak alanları mevcut dönemden doldurulur. */
	function openPanel() {
		const p = period;
		if (!p) return;
		const fallback = monthRangeInTz(0, p.timeZone);
		draftFrom = p.from || fallback.from;
		draftTo = p.to || fallback.to;
		open = true;
	}

	/** Aralık tam bir takvim ayını kapsıyor mu — ok tuşları hep böyle bir aralık üretir. */
	function isWholeMonth(from: string, to: string): boolean {
		if (!from || !to) return false;
		const a = new Date(`${from}T00:00:00Z`);
		const b = new Date(`${to}T00:00:00Z`);
		if (a.getUTCDate() !== 1) return false;
		if (a.getUTCFullYear() !== b.getUTCFullYear() || a.getUTCMonth() !== b.getUTCMonth()) {
			return false;
		}
		const lastDay = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate();
		return b.getUTCDate() === lastDay;
	}

	function monthYear(dayKey: string): string {
		return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(
			new Date(`${dayKey}T00:00:00Z`)
		);
	}

	/*
	 * Etiket: "tüm zamanlar", tam ay ise "Ekim 2026", değilse iki uç.
	 * Tam ay kontrolü `key`'e değil ARALIĞA bakar: ok tuşları dönemi `ozel` yapıyor
	 * ama ürettiği şey yine bir aydır; kullanıcı "1 Eki – 31 Eki" değil "Ekim 2026"
	 * görmeli.
	 */
	const label = $derived.by(() => {
		const p = period;
		if (!p) return '';
		if (p.key === 'tum') return t('reports.period.allTime');
		if (p.from && p.to && !isWholeMonth(p.from, p.to)) {
			return `${shortDay(p.from)} – ${shortDay(p.to)}`;
		}
		return monthYear(p.from || monthRangeInTz(0, p.timeZone).from);
	});

	function shortDay(dayKey: string): string {
		return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(
			new Date(`${dayKey}T00:00:00Z`)
		);
	}

	/**
	 * Ay ilerlet/gerilet. Hangi dönemde olursa olsun sonuç bir AY aralığıdır — ok
	 * tuşunun anlamı "bir ay öteye git"; `tum` ya da özel aralıktan basılınca da
	 * içinde bulunulan aydan başlar.
	 */
	function stepMonth(delta: number) {
		const p = period;
		if (!p) return;
		const anchor = p.key === 'tum' || !p.from ? monthRangeInTz(0, p.timeZone).from : p.from;
		const d = new Date(`${anchor}T00:00:00Z`);
		d.setUTCMonth(d.getUTCMonth() + delta, 1);
		const year = d.getUTCFullYear();
		const month = d.getUTCMonth() + 1;
		const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
		const mm = String(month).padStart(2, '0');
		p.setRange(`${year}-${mm}-01`, `${year}-${mm}-${String(lastDay).padStart(2, '0')}`);
	}

	function goThisMonth() {
		const p = period;
		if (!p) return;
		p.setKey('bu-ay');
		open = false;
	}

	function applyRange() {
		const p = period;
		if (!p || !draftFrom || !draftTo) return;
		p.setRange(draftFrom, draftTo);
		open = false;
	}

	function allTime() {
		const p = period;
		if (!p) return;
		p.setKey('tum');
		open = false;
	}
</script>

{#if period}
	<!-- Logodan arama ikonuna kadar uzanır; ay ortada durur. -->
	<div class="flex min-w-0 items-center">
		<div
			class="flex h-11 w-full min-w-0 items-stretch overflow-hidden rounded-[8px] border border-border bg-surface"
			role="group"
			aria-label={t('reports.period.label')}
		>
			<button
				type="button"
				class="flex w-11 shrink-0 items-center justify-center text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
				aria-label={t('reports.period.prevMonth')}
				onclick={() => stepMonth(-1)}
			>
				<ChevronLeft class="size-4" />
			</button>
			<button
				type="button"
				class="flex min-w-0 flex-1 items-center justify-center gap-1 border-x border-border px-2 text-sm font-medium text-text transition-colors hover:bg-surface-2"
				aria-haspopup="dialog"
				aria-expanded={open}
				onclick={() => (open ? (open = false) : openPanel())}
			>
				<span class="truncate">{label}</span>
				<ChevronDown
					class="size-3.5 shrink-0 text-text-muted transition-transform {open ? 'rotate-180' : ''}"
					aria-hidden="true"
				/>
			</button>
			<button
				type="button"
				class="flex w-11 shrink-0 items-center justify-center text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
				aria-label={t('reports.period.nextMonth')}
				onclick={() => stepMonth(1)}
			>
				<ChevronRight class="size-4" />
			</button>
		</div>
	</div>

	{#if open}
		<div use:portal>
			<button
				type="button"
				class="fixed inset-0 z-40 cursor-default"
				aria-label={t('common.close')}
				onclick={() => (open = false)}
			></button>
			<div
				class="fixed inset-x-3 top-[calc(3.5rem+0.5rem)] z-50 rounded-[10px] border border-border bg-surface p-3 shadow-lg"
				role="dialog"
				aria-label={t('reports.period.label')}
			>
				<button
					type="button"
					class="w-full rounded-[8px] border border-brand/40 bg-brand-subtle px-3 py-2 text-sm font-medium text-brand-text transition-colors hover:bg-brand/15"
					onclick={goThisMonth}
				>
					{t('reports.period.goThisMonth')}
				</button>

				<div class="mt-3 grid gap-2">
					<label class="grid gap-1 text-xs text-text-muted">
						{t('reports.period.from')}
						<input type="date" class={fieldClass} bind:value={draftFrom} />
					</label>
					<label class="grid gap-1 text-xs text-text-muted">
						{t('reports.period.to')}
						<input type="date" class={fieldClass} bind:value={draftTo} />
					</label>
				</div>

				<button
					type="button"
					class="mt-3 w-full rounded-[8px] border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:text-text"
					onclick={allTime}
				>
					{t('reports.period.allTime')}
				</button>

				<div class="mt-3 flex gap-2">
					<button
						type="button"
						class="flex-1 rounded-[8px] bg-brand px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
						disabled={!draftFrom || !draftTo}
						onclick={applyRange}
					>
						{t('common.apply')}
					</button>
					<button
						type="button"
						class="flex-1 rounded-[8px] border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:text-text"
						onclick={() => (open = false)}
					>
						{t('common.cancel')}
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}

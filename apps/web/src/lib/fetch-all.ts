import { apiGet } from '$lib/api';
import { listUrl } from '@verimaya/shared';
import type { ListQueryParams } from '@verimaya/shared';

/** Sunucunun kabul ettiği en büyük sayfa (`packages/shared/src/common.ts`). */
export const MAX_PAGE_LIMIT = 100;

/** Kaç sayfadan sonra durulur. 100 × 50 = 5.000 kayıt. */
const MAX_PAGES = 50;

export type FetchAllResult<T> = {
	items: T[];
	/** Üst sınıra takılıp erken durduysak true — çağıran "hepsi bu" varsayamaz. */
	truncated: boolean;
};

/**
 * Bir liste ucunun TÜM sayfalarını gezer.
 *
 * Neden var: kodda pek çok yerde `limit: 100` ile ilk sayfa çekilip sonuç "tüm küme"
 * gibi kullanılıyordu — ad çözme, eşleştirme, seçici doldurma gibi işlerde. Küçük
 * veride doğru çalışıp 800 kayıtta sessizce yanlış sonuç veriyordu. En kötüsü de
 * `limit: 500` yazan yer: sunucu üst sınırı 100 olduğu için istek 400 dönüyor ve
 * liste BOŞ kalıyordu (randevu formu, 2026-09-02'den 09-11'e kadar).
 *
 * Seçici doldurmak, ad sözlüğü kurmak gibi "hepsi lazım" işlerinde bunu kullanın;
 * kullanıcıya sayfalama sunan listelerde `createInfiniteQuery` doğru araçtır.
 */
export async function fetchAllPages<T>(
	resource: string,
	params: Omit<ListQueryParams, 'cursor' | 'limit'> = {}
): Promise<FetchAllResult<T>> {
	const items: T[] = [];
	let cursor: string | null = null;

	for (let page = 0; page < MAX_PAGES; page++) {
		const url = listUrl(resource, {
			...params,
			limit: MAX_PAGE_LIMIT,
			...(cursor ? { cursor } : {})
		});
		const res = await apiGet<{ items: T[]; next_cursor: string | null }>(url);
		items.push(...(res.items ?? []));
		cursor = res.next_cursor ?? null;
		if (!cursor) return { items, truncated: false };
	}

	return { items, truncated: true };
}

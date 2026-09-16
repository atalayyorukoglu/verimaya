import type { Contact } from '@verimaya/shared';
import { apiGet, apiPaths } from '$lib/api';

/**
 * Seçili kişinin görünen adı.
 *
 * Sunucu taraflı aramaya geçince kutunun listesi artık "her kişiyi" içermiyor:
 * seçili kayıt (ör. sunucunun ön doldurduğu hasta ya da düzenlenen eski işlemin
 * sorumlusu) önceden yüklenen ilk sayfada olmayabiliyor ve kutu boş görünüyordu.
 * Bilinmeyen kimlik tek tek `GET /contacts/:id` ile çözülür, sonuç bellekte kalır.
 */
export function createContactLabelCache(known: () => Contact[]) {
	let cache = $state<Record<string, string>>({});
	/** Reaktif değil bilinçli: yalnız "bu kimliği bir kez istedik" işareti. */
	const attempted = new Set<string>();

	function labelFor(id: string | null | undefined): string | null {
		if (!id) return null;
		return known().find((c) => c.id === id)?.display_name ?? cache[id] ?? null;
	}

	async function resolve(id: string) {
		if (attempted.has(id)) return;
		attempted.add(id);
		try {
			const contact = await apiGet<Contact>(apiPaths.contact(id));
			cache = { ...cache, [id]: contact.display_name };
		} catch {
			// Ad çözülemezse kutu boş görünür ama seçim korunur; kayıt yine çalışır.
		}
	}

	/** Eksik adları arka planda çözer; `$effect` içinden çağrılır. */
	function ensure(ids: Array<string | null | undefined>) {
		for (const id of ids) {
			if (id && !labelFor(id)) void resolve(id);
		}
	}

	return {
		labelFor,
		ensure
	};
}

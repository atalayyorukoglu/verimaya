import type { Contact, ContactType } from '@verimaya/shared';
import { apiGet, listUrl } from '$lib/api';
import type { ComboboxOption } from '$lib/components/Combobox.svelte';

/**
 * Kişi arama — sunucu taraflı.
 *
 * Neden: formlar kişileri `limit: 100` ile tek seferde çekiyordu. 1000+ kişili
 * kiracıda aranan hasta / firma o ilk sayfada olmadığı için Combobox "eşleşen
 * yok" diyordu, "Dumos Hotel" gibi kayıtlar hiç görünmüyordu. Harfler artık
 * API'nin var olan `q` süzgecine gidiyor.
 */
export const CONTACT_SEARCH_LIMIT = 20;

export function contactToOption(contact: Contact): ComboboxOption {
	return {
		value: contact.id,
		label: contact.display_name,
		description: contact.contact_type_name
	};
}

/** Kişi türü adından id — sunucu süzgeci (`type_id`) için. Bulunamazsa null. */
export function contactTypeIdByName(types: ContactType[], name: string): string | null {
	const key = name.trim().toLocaleLowerCase('tr');
	return types.find((t) => t.name.trim().toLocaleLowerCase('tr') === key)?.id ?? null;
}

export async function searchContactOptions(
	query: string,
	options: {
		/** Sunucu süzgeci; ör. yalnız Hasta. */
		typeId?: string | null;
		/** `typeId` çözülemediyse istemcide bu ada göre elenir. */
		typeName?: string | null;
	} = {}
): Promise<ComboboxOption[]> {
	const term = query.trim();
	if (!term) return [];
	const { items } = await apiGet<{ items: Contact[] }>(
		listUrl('contacts', {
			q: term,
			limit: CONTACT_SEARCH_LIMIT,
			...(options.typeId ? { type_id: options.typeId } : {})
		})
	);
	const filtered =
		!options.typeId && options.typeName
			? items.filter(
					(c) =>
						c.contact_type_name.trim().toLocaleLowerCase('tr') ===
						options.typeName!.trim().toLocaleLowerCase('tr')
				)
			: items;
	return filtered.map(contactToOption);
}

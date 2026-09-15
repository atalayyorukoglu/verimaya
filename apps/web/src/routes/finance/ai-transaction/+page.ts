import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Sayfa Araçlar altına taşındı (2026-09-15); eski bağlantılar ve yer imleri kırılmasın. */
export const load: PageLoad = ({ url }) => {
	redirect(301, `/ai-transaction${url.search}`);
};

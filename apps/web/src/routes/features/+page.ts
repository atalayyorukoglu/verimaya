import { redirect } from '@sveltejs/kit';

/** Eski /features → Araçlar (308 kalıcı yönlendirme). */
export function load() {
	redirect(308, '/toolkit');
}

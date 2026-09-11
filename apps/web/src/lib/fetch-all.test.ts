import { describe, expect, it, vi, beforeEach } from 'vitest';

const apiGet = vi.fn();
vi.mock('$lib/api', () => ({ apiGet: (url: string) => apiGet(url) }));

const { fetchAllPages, MAX_PAGE_LIMIT } = await import('./fetch-all');

describe('fetchAllPages', () => {
	beforeEach(() => apiGet.mockReset());

	it('cursor bitene kadar bütün sayfaları toplar', async () => {
		apiGet
			.mockResolvedValueOnce({ items: [{ id: 'a' }], next_cursor: 'c1' })
			.mockResolvedValueOnce({ items: [{ id: 'b' }], next_cursor: 'c2' })
			.mockResolvedValueOnce({ items: [{ id: 'c' }], next_cursor: null });

		const res = await fetchAllPages<{ id: string }>('contacts');

		expect(res.items.map((x) => x.id)).toEqual(['a', 'b', 'c']);
		expect(res.truncated).toBe(false);
		expect(apiGet).toHaveBeenCalledTimes(3);
	});

	it('sunucunun üst sınırını aşan limit göndermez', async () => {
		// Asıl hata buydu: limit=500 → 400 → liste boş → seçiciler boş kalıyordu.
		apiGet.mockResolvedValue({ items: [], next_cursor: null });
		await fetchAllPages('contacts');
		expect(apiGet.mock.calls[0]![0]).toContain(`limit=${MAX_PAGE_LIMIT}`);
		expect(
			Number(new URL(apiGet.mock.calls[0]![0], 'http://x').searchParams.get('limit'))
		).toBeLessThanOrEqual(100);
	});

	it('cursor hiç bitmezse durur ve truncated bildirir', async () => {
		apiGet.mockResolvedValue({ items: [{ id: 'x' }], next_cursor: 'hep-devam' });
		const res = await fetchAllPages<{ id: string }>('contacts');
		expect(res.truncated).toBe(true);
		expect(res.items.length).toBe(50);
	});

	it('süzgeç parametrelerini her sayfada korur', async () => {
		apiGet
			.mockResolvedValueOnce({ items: [], next_cursor: 'c1' })
			.mockResolvedValueOnce({ items: [], next_cursor: null });
		await fetchAllPages('contacts', { type_id: 'klinik-id' });
		for (const call of apiGet.mock.calls) {
			expect(call[0]).toContain('type_id=klinik-id');
		}
		expect(apiGet.mock.calls[1]![0]).toContain('cursor=c1');
	});
});

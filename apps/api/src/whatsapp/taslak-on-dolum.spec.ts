import { describe, expect, it } from 'vitest';
import type { TransactionDraft } from '@verimaya/shared';
import type { KisiAdayi } from './kisi-eslestir';
import { taslaklariOnDoldur } from './taslak-on-dolum';

const hasta = (id: string, first: string, last: string): KisiAdayi => ({
	id,
	displayName: `${first} ${last}`,
	firstName: first,
	lastName: last,
	contactTypeName: 'Hasta',
	isInternal: false
});
const kurum = (id: string, ad: string): KisiAdayi => ({
	id,
	displayName: ad,
	firstName: null,
	lastName: null,
	contactTypeName: 'Otel',
	isInternal: false
});

const adaylar: KisiAdayi[] = [
	hasta('karen', 'Karen', "O'Donnell"),
	hasta('claire', 'Claire', 'McLeod'),
	kurum('dumos', 'Dumos Hotel')
];

function taslak(over: Partial<TransactionDraft> = {}): TransactionDraft {
	return {
		kind: 'expense',
		amount: 10_000,
		currency: 'TRY',
		title: 'test',
		occurred_on: '2026-09-16',
		...over
	} as TransactionDraft;
}

describe('taslaklariOnDoldur', () => {
	it('mesaja bağlı tek Hasta varsa hasta alanını önerir', () => {
		const [r] = taslaklariOnDoldur([taslak()], adaylar, ['karen', 'dumos']);
		expect(r.case_contact_id).toBe('karen');
	});

	it('birden fazla hasta bağlıysa boş bırakır — yanlış hasta yazmaz', () => {
		const [r] = taslaklariOnDoldur([taslak()], adaylar, ['karen', 'claire']);
		expect(r.case_contact_id).toBeUndefined();
	});

	it('hiç hasta bağlı değilse boş bırakır', () => {
		const [r] = taslaklariOnDoldur([taslak()], adaylar, ['dumos']);
		expect(r.case_contact_id).toBeUndefined();
	});

	it('serbest karşı taraf adını dizinde bulup contact_id doldurur', () => {
		const [r] = taslaklariOnDoldur([taslak({ contact_label: 'Dumos Hotel' })], adaylar, []);
		expect(r.contact_id).toBe('dumos');
		expect(r.contact_display_name).toBe('Dumos Hotel');
		// Mesajın kendi ifadesi korunur.
		expect(r.contact_label).toBe('Dumos Hotel');
	});

	it('dizinde yoksa kişi boş kalır, serbest ad bozulmaz', () => {
		const [r] = taslaklariOnDoldur([taslak({ contact_label: 'Bilinmeyen Klinik' })], adaylar, []);
		expect(r.contact_id).toBeUndefined();
		expect(r.contact_label).toBe('Bilinmeyen Klinik');
	});

	it('model zaten kişi bulduysa üstüne yazmaz', () => {
		const [r] = taslaklariOnDoldur(
			[taslak({ contact_id: 'claire', contact_label: 'Dumos Hotel' })],
			adaylar,
			[]
		);
		expect(r.contact_id).toBe('claire');
	});
});

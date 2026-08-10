import { describe, expect, it } from 'vitest';
import type { Contact } from '@verimaya/shared';
import { heuristicParseWhatsappMessage } from '../../whatsapp/heuristic-parse';
import {
	buildMaskedLlmUserPayload,
	maskMessagePii,
	maskPatientNamesInMessage,
	PII_PLACEHOLDERS
} from './pii-mask';

function patient(id: string, display_name: string): Contact {
	return {
		id,
		tenant_id: '00000000-0000-4000-8000-000000000001',
		contact_type_id: '00000000-0000-4000-8000-000000000010',
		contact_type_name: 'Hasta',
		first_name: display_name.split(' ')[0] || display_name,
		last_name: display_name.split(' ').slice(1).join(' ') || null,
		display_name,
		phone: null,
		email: null,
		notes: null,
		organization_id: null,
		status: 'scheduled',
		assigned_user_id: null,
		source: null,
		medium: null,
		campaign: null,
		referred_by_contact_id: null,
		is_internal: false,
		usage_count: 0,
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z'
	};
}

describe('maskMessagePii', () => {
	it('masks email (positive) and leaves plain text (negative)', () => {
		expect(maskMessagePii('yaz sandra@clinic.com')).toContain(PII_PLACEHOLDERS.email);
		expect(maskMessagePii('sandra clinic com')).not.toContain(PII_PLACEHOLDERS.email);
	});

	it('masks TR mobile and intl phone; ignores bare amounts', () => {
		expect(maskMessagePii('ara 0532 111 22 33')).toContain(PII_PLACEHOLDERS.phone);
		expect(maskMessagePii('ara +90 532 111 2233')).toContain(PII_PLACEHOLDERS.phone);
		expect(maskMessagePii('call +44 7700 900123')).toContain(PII_PLACEHOLDERS.phone);
		const amountOnly = maskMessagePii('Sandra 2900 GBP ödeme alındı');
		expect(amountOnly).not.toContain(PII_PLACEHOLDERS.phone);
		expect(amountOnly).toContain('2900');
	});

	it('masks TCKN; ignores shorter digit runs', () => {
		expect(maskMessagePii('tc 12345678901')).toContain(PII_PLACEHOLDERS.tckn);
		expect(maskMessagePii('ref 1234567890')).not.toContain(PII_PLACEHOLDERS.tckn);
	});

	it('masks IBAN and spaced card numbers', () => {
		expect(maskMessagePii('iban TR330006100519786457841326')).toContain(PII_PLACEHOLDERS.iban);
		expect(maskMessagePii('kart 4111 1111 1111 1111')).toContain(PII_PLACEHOLDERS.card);
		expect(maskMessagePii('kod 4111')).not.toContain(PII_PLACEHOLDERS.card);
	});
});

describe('buildMaskedLlmUserPayload', () => {
	const sandra = patient('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'Sandra Yılmaz');

	it('strips display_name from patient hints (opaque patient_ref only)', () => {
		const payload = buildMaskedLlmUserPayload({
			message: 'Sandra Yılmaz 2900 GBP ödeme alındı',
			patients: [sandra]
		});
		expect(payload.patients).toEqual([{ patient_ref: sandra.id }]);
		expect(JSON.stringify(payload)).not.toMatch(/Sandra|Yılmaz|display_name/i);
		expect(payload.message).toContain(PII_PLACEHOLDERS.patient);
		expect(payload.message).toContain('2900');
		expect(payload.message).toContain('GBP');
	});

	it('redacts phone + email + name from a realistic WhatsApp body', () => {
		const msg =
			'Sandra Yılmaz 2900 GBP ödeme alındı tel +90 532 111 2233 mail sandra@clinic.com';
		const payload = buildMaskedLlmUserPayload({ message: msg, patients: [sandra] });
		const body = JSON.stringify(payload);
		expect(body).not.toContain('532');
		expect(body).not.toContain('sandra@clinic.com');
		expect(body).not.toContain('Sandra');
		expect(payload.message).toContain('2900 GBP');
		expect(payload.message).toContain(PII_PLACEHOLDERS.phone);
		expect(payload.message).toContain(PII_PLACEHOLDERS.email);
		expect(payload.message).toContain(PII_PLACEHOLDERS.patient);
	});
});

describe('masking does not break heuristic amount/date extraction', () => {
	const patients = [patient('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'Sandra Yılmaz')];

	it('example 1: amount + currency still parse after masking', () => {
		const original = 'Sandra Yılmaz 2900 GBP ödeme alındı';
		const masked = maskMessagePii(maskPatientNamesInMessage(original, patients));
		const drafts = heuristicParseWhatsappMessage(masked, patients);
		expect(drafts.length).toBeGreaterThanOrEqual(1);
		expect(drafts[0]?.amount).toBe(290000);
		expect(drafts[0]?.currency).toBe('GBP');
	});

	it('example 2: TRY amount with phone redacted still parses', () => {
		const original = 'Ahmet 1.500,50 TRY tahsilat 0532 111 22 33';
		const patientsB = [patient('bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'Ahmet Demir')];
		const masked = maskMessagePii(maskPatientNamesInMessage(original, patientsB));
		expect(masked).toContain(PII_PLACEHOLDERS.phone);
		const drafts = heuristicParseWhatsappMessage(masked, patientsB);
		expect(drafts[0]?.amount).toBe(150050);
		expect(drafts[0]?.currency).toBe('TRY');
	});

	it('example 3: EUR expense line survives email/iban masking', () => {
		const original =
			'Lab ödeme 800 EUR ödendi iban TR330006100519786457841326 mail ops@lab.com';
		const masked = maskMessagePii(original);
		expect(masked).toContain(PII_PLACEHOLDERS.iban);
		expect(masked).toContain(PII_PLACEHOLDERS.email);
		const drafts = heuristicParseWhatsappMessage(masked, []);
		expect(drafts[0]?.amount).toBe(80000);
		expect(drafts[0]?.currency).toBe('EUR');
		expect(drafts[0]?.kind).toBe('expense');
	});
});

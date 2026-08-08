import { describe, expect, it } from 'vitest';
import {
	INVALID_TIMEZONE_CODE,
	TENANT_TIMEZONES,
	isIanaTimeZone,
	tenantTimezoneSchema,
	tenantUpdateSchema
} from './tenant.js';

describe('tenantTimezoneSchema (AUDIT-F09-19)', () => {
	it('accepts every UI TENANT_TIMEZONES value (current tenant presets)', () => {
		for (const tz of TENANT_TIMEZONES) {
			expect(isIanaTimeZone(tz)).toBe(true);
			expect(tenantTimezoneSchema.parse(tz)).toBe(tz);
		}
	});

	it('accepts UTC aliases and other valid IANA zones', () => {
		expect(tenantTimezoneSchema.parse('UTC')).toBe('UTC');
		expect(tenantTimezoneSchema.parse('Etc/UTC')).toBe('Etc/UTC');
		expect(tenantTimezoneSchema.parse('America/New_York')).toBe('America/New_York');
	});

	it('rejects inventing non-IANA timezones and injection-shaped strings', () => {
		for (const bad of ['Mars/Olympus', "'; DROP", 'Not/A_Real_Zone', '']) {
			expect(isIanaTimeZone(bad)).toBe(false);
			expect(tenantTimezoneSchema.safeParse(bad).success).toBe(false);
		}
		const result = tenantTimezoneSchema.safeParse('Mars/Olympus');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.params).toMatchObject({ code: INVALID_TIMEZONE_CODE });
		}
	});

	it('tenantUpdateSchema rejects invalid timezone', () => {
		const result = tenantUpdateSchema.safeParse({ timezone: 'Foo/Bar' });
		expect(result.success).toBe(false);
	});
});

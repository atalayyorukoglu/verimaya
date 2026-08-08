import { createHash } from 'node:crypto';
import type { AppointmentTypeSetting } from '@verimaya/shared';
import { DEFAULT_APPOINTMENT_TYPE_NAMES } from '@verimaya/shared';

/** Deterministic UUID for a default appointment type name (migration seed must match). */
export function defaultAppointmentTypeId(tenantId: string, name: string): string {
	const hash = createHash('sha256')
		.update(`appointment-type:${tenantId}:${name}`)
		.digest('hex');
	return [
		hash.slice(0, 8),
		hash.slice(8, 12),
		`4${hash.slice(13, 16)}`,
		`8${hash.slice(17, 20)}`,
		hash.slice(20, 32)
	].join('-');
}

export function buildDefaultAppointmentTypes(tenantId: string): AppointmentTypeSetting[] {
	return DEFAULT_APPOINTMENT_TYPE_NAMES.map((name, i) => ({
		id: defaultAppointmentTypeId(tenantId, name),
		tenant_id: tenantId,
		name,
		sort_order: i
	}));
}

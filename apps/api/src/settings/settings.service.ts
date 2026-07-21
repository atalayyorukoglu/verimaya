import { Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import {
	DEFAULT_CONTACT_TYPE_NAMES,
	DEFAULT_FINANCE_CATEGORY_SEEDS
} from '@verimaya/shared';
import { contactTypes, financeCategories } from '../db/schema';
import { toContactType, toFinanceCategory } from '../common/mappers';
import { TenantContextService } from '../tenant/tenant-context.service';
import { buildDefaultAppointmentTypes } from './appointment-type-defaults';

@Injectable()
export class SettingsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async listFinanceCategories(tenantId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			let rows = await db
				.select()
				.from(financeCategories)
				.orderBy(asc(financeCategories.sortOrder), asc(financeCategories.name));

			if (rows.length === 0) {
				await db.insert(financeCategories).values(
					DEFAULT_FINANCE_CATEGORY_SEEDS.map((seed, i) => ({
						tenantId,
						kind: seed.kind,
						name: seed.name,
						sortOrder: i,
						subcategories: seed.subcategories
					}))
				);
				rows = await db
					.select()
					.from(financeCategories)
					.orderBy(asc(financeCategories.sortOrder), asc(financeCategories.name));
			}

			return { items: rows.map(toFinanceCategory) };
		});
	}

	async listContactTypes(tenantId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			let rows = await db
				.select()
				.from(contactTypes)
				.orderBy(asc(contactTypes.sortOrder), asc(contactTypes.name));

			if (rows.length === 0) {
				await db.insert(contactTypes).values(
					DEFAULT_CONTACT_TYPE_NAMES.map((name, i) => ({
						tenantId,
						name,
						sortOrder: i
					}))
				);
				rows = await db
					.select()
					.from(contactTypes)
					.orderBy(asc(contactTypes.sortOrder), asc(contactTypes.name));
			}

			return { items: rows.map(toContactType) };
		});
	}

	listAppointmentTypes(tenantId: string) {
		return { items: buildDefaultAppointmentTypes(tenantId) };
	}
}

/**
 * Global ECB/Frankfurter FX rate cache.
 *
 * INTENTIONAL EXCEPTION to multi-tenant rules (AGENTS.md §1):
 * - No `tenant_id` — ECB rates are identical for every tenant (reference data).
 * - No RLS — there is nothing to isolate; rates are not business rows.
 * Documented alongside karne_* in AGENTS.md / docs/MIMARI.md.
 * Do not copy this pattern to domain/business tables.
 */
import { check, date, numeric, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { timestamptz } from './helpers';

export const fxRates = pgTable(
	'fx_rates',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		/** Provider's rate day (may differ from the requested calendar day on weekends/holidays). */
		rateDate: date('rate_date', { mode: 'string' }).notNull(),
		fromCurrency: text('from_currency').notNull(),
		toCurrency: text('to_currency').notNull(),
		rate: numeric('rate', { precision: 18, scale: 8, mode: 'number' }).notNull(),
		provider: text('provider').notNull(),
		fetchedAt: timestamptz('fetched_at').notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('fx_rates_date_from_to_uidx').on(
			table.rateDate,
			table.fromCurrency,
			table.toCurrency
		),
		check(
			'fx_rates_from_currency_chk',
			sql`${table.fromCurrency} IN ('TRY', 'GBP', 'EUR', 'USD')`
		),
		check('fx_rates_to_currency_chk', sql`${table.toCurrency} IN ('TRY', 'GBP', 'EUR', 'USD')`),
		check('fx_rates_rate_positive_chk', sql`${table.rate} > 0`),
		check('fx_rates_provider_chk', sql`${table.provider} IN ('frankfurter')`)
	]
);

export type FxRateRow = typeof fxRates.$inferSelect;
export type NewFxRateRow = typeof fxRates.$inferInsert;

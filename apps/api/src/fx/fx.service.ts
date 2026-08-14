import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { FxRateQuery, FxRateResponse, SupportedCurrency } from '@verimaya/shared';
import { DbService } from '../db/db.service';
import { fxRates } from '../db/schema/fx-rates';
import {
	FrankfurterClient,
	FrankfurterProviderError,
	clampFxDate,
	frankfurterErrorToHttp,
	utcTodayIso
} from '../integrations/frankfurter/frankfurter.client';

@Injectable()
export class FxService {
	constructor(
		private readonly db: DbService,
		private readonly frankfurter: FrankfurterClient
	) {}

	async getRate(query: FxRateQuery, requestId: string): Promise<FxRateResponse> {
		const from = query.from;
		const to = query.to;
		const on = clampFxDate(query.on, utcTodayIso());

		if (from === to) {
			return {
				from,
				to,
				rate: 1,
				date: on,
				provider: 'frankfurter',
				cached: true
			};
		}

		const cached = await this.findCached(on, from, to);
		if (cached) {
			return {
				from,
				to,
				rate: cached.rate,
				date: cached.rateDate,
				provider: 'frankfurter',
				cached: true
			};
		}

		try {
			const fetched = await this.frankfurter.fetchRate(on, from, to);
			await this.upsertCache(on, fetched.rateDate, from, to, fetched.rate);
			return {
				from,
				to,
				rate: fetched.rate,
				date: fetched.rateDate,
				provider: 'frankfurter',
				cached: false
			};
		} catch (err) {
			if (err instanceof FrankfurterProviderError) {
				throw frankfurterErrorToHttp(err, requestId);
			}
			throw err;
		}
	}

	private async findCached(
		on: string,
		from: SupportedCurrency,
		to: SupportedCurrency
	): Promise<{ rate: number; rateDate: string } | null> {
		const [row] = await this.db.client
			.select({
				rate: fxRates.rate,
				rateDate: fxRates.rateDate
			})
			.from(fxRates)
			.where(
				and(
					eq(fxRates.requestedDate, on),
					eq(fxRates.fromCurrency, from),
					eq(fxRates.toCurrency, to)
				)
			)
			.limit(1);

		if (!row || typeof row.rate !== 'number' || !(row.rate > 0)) return null;
		return { rate: row.rate, rateDate: row.rateDate };
	}

	private async upsertCache(
		requestedDate: string,
		rateDate: string,
		from: SupportedCurrency,
		to: SupportedCurrency,
		rate: number
	): Promise<void> {
		await this.db.client
			.insert(fxRates)
			.values({
				requestedDate,
				rateDate,
				fromCurrency: from,
				toCurrency: to,
				rate,
				provider: 'frankfurter'
			})
			.onConflictDoNothing({
				target: [fxRates.requestedDate, fxRates.fromCurrency, fxRates.toCurrency]
			});
	}
}

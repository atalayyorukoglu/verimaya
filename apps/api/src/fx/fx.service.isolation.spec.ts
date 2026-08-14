import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DbService } from '../db/db.service';
import { fxRates } from '../db/schema/fx-rates';
import type { FrankfurterClient } from '../integrations/frankfurter/frankfurter.client';
import { FxService } from './fx.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const requestedDate = '2026-03-14';
const fromCurrency = 'TRY';
const toCurrency = 'GBP';

describe('FxService cache isolation', () => {
	let db: DbService;

	const deleteFixture = async () => {
		await db.client
			.delete(fxRates)
			.where(
				and(
					eq(fxRates.requestedDate, requestedDate),
					eq(fxRates.fromCurrency, fromCurrency),
					eq(fxRates.toCurrency, toCurrency)
				)
			);
	};

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		db = new DbService(new ConfigService());
		await deleteFixture();
	});

	afterAll(async () => {
		await deleteFixture();
		await db.onModuleDestroy();
	});

	it('caches a weekend request by requested date when provider date differs', async () => {
		const fetchRate = vi.fn().mockResolvedValue({
			rate: 0.022,
			rateDate: '2026-03-13',
			url: 'https://api.frankfurter.dev/v1/2026-03-14?from=TRY&to=GBP'
		});
		const frankfurter = { fetchRate } as unknown as FrankfurterClient;
		const service = new FxService(db, frankfurter);

		const first = await service.getRate(
			{ from: fromCurrency, to: toCurrency, on: requestedDate },
			'req-1'
		);
		const second = await service.getRate(
			{ from: fromCurrency, to: toCurrency, on: requestedDate },
			'req-2'
		);

		expect(fetchRate).toHaveBeenCalledTimes(1);
		expect(first).toMatchObject({ date: '2026-03-13', cached: false });
		expect(second).toMatchObject({ date: '2026-03-13', cached: true });
	});
});

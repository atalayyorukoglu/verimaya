import { BadGatewayException, GatewayTimeoutException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import {
	FrankfurterClient,
	FrankfurterProviderError,
	clampFxDate,
	frankfurterErrorToHttp,
	toIsoDate,
	type FetchFn
} from '../integrations/frankfurter/frankfurter.client';
import { FxService } from './fx.service';
import type { DbService } from '../db/db.service';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('clampFxDate / toIsoDate', () => {
	it('clamps future dates to today', () => {
		expect(clampFxDate('2099-01-01', '2026-03-14')).toBe('2026-03-14');
		expect(clampFxDate('2026-03-10', '2026-03-14')).toBe('2026-03-10');
	});

	it('toIsoDate keeps calendar date from string and UTC Date', () => {
		expect(toIsoDate('2026-03-14T23:00:00.000Z')).toBe('2026-03-14');
		expect(toIsoDate(new Date(Date.UTC(2026, 2, 14)))).toBe('2026-03-14');
	});
});

describe('FrankfurterClient', () => {
	const config = {
		get: vi.fn(() => undefined)
	} as unknown as ConfigService;

	it('returns provider date (weekend → prior business day)', async () => {
		const fetchFn: FetchFn = async (url) => {
			expect(String(url)).toContain('/2026-03-14?');
			return jsonResponse({ date: '2026-03-13', rates: { GBP: 0.022 } });
		};
		const client = new FrankfurterClient(config).withTestHooks({
			fetchFn,
			sleepFn: async () => undefined,
			timeoutMs: 1000
		});
		const result = await client.fetchRate('2026-03-14', 'TRY', 'GBP');
		expect(result).toEqual({
			rate: 0.022,
			rateDate: '2026-03-13',
			url: expect.any(String)
		});
	});

	it('fails immediately on 4xx without retry', async () => {
		let calls = 0;
		const fetchFn: FetchFn = async () => {
			calls += 1;
			return jsonResponse({ message: 'not found' }, 404);
		};
		const client = new FrankfurterClient(config).withTestHooks({
			fetchFn,
			sleepFn: async () => undefined
		});
		await expect(client.fetchRate('2026-03-14', 'TRY', 'GBP')).rejects.toMatchObject({
			code: 'rate_provider_error',
			httpStatus: 404
		});
		expect(calls).toBe(1);
	});

	it('retries once on timeout then succeeds', async () => {
		let calls = 0;
		const fetchFn: FetchFn = async () => {
			calls += 1;
			if (calls === 1) {
				const err = new Error('aborted');
				err.name = 'AbortError';
				throw err;
			}
			return jsonResponse({ date: '2026-03-13', rates: { GBP: 0.023 } });
		};
		const sleeps: number[] = [];
		const client = new FrankfurterClient(config).withTestHooks({
			fetchFn,
			sleepFn: async (ms) => {
				sleeps.push(ms);
			}
		});
		const result = await client.fetchRate('2026-03-13', 'TRY', 'GBP');
		expect(result.rate).toBe(0.023);
		expect(calls).toBe(2);
		expect(sleeps).toEqual([1000]);
	});

	it('throws rate_unavailable when rates missing', async () => {
		const client = new FrankfurterClient(config).withTestHooks({
			fetchFn: async () => jsonResponse({ date: '2026-03-13', rates: {} }),
			sleepFn: async () => undefined
		});
		await expect(client.fetchRate('2026-03-13', 'TRY', 'GBP')).rejects.toMatchObject({
			code: 'rate_unavailable'
		});
	});
});

describe('frankfurterErrorToHttp', () => {
	it('maps timeout to 504 and other provider errors to 502', () => {
		expect(
			frankfurterErrorToHttp(
				new FrankfurterProviderError('rate_provider_timeout', 504, 'rate_provider_timeout'),
				'req-1'
			)
		).toBeInstanceOf(GatewayTimeoutException);
		expect(
			frankfurterErrorToHttp(
				new FrankfurterProviderError('rate_provider_error', 502, 'rate_provider_error_502_TRY_GBP'),
				'req-1'
			)
		).toBeInstanceOf(BadGatewayException);
	});
});

describe('FxService', () => {
	const selectLimit = vi.fn();
	const selectWhere = vi.fn(() => ({ limit: selectLimit }));
	const selectFrom = vi.fn(() => ({ where: selectWhere }));
	const select = vi.fn(() => ({ from: selectFrom }));
	const onConflictDoNothing = vi.fn(async () => undefined);
	const insertValues = vi.fn(() => ({ onConflictDoNothing }));
	const insert = vi.fn(() => ({ values: insertValues }));

	const db = {
		client: { select, insert }
	} as unknown as DbService;

	const frankfurter = {
		fetchRate: vi.fn()
	};

	let service: FxService;

	beforeEach(() => {
		vi.clearAllMocks();
		selectLimit.mockResolvedValue([]);
		service = new FxService(db, frankfurter as unknown as FrankfurterClient);
	});

	it('short-circuits from === to without provider or cache', async () => {
		const result = await service.getRate(
			{ from: 'GBP', to: 'GBP', on: '2026-03-14' },
			'req-1'
		);
		expect(result).toEqual({
			from: 'GBP',
			to: 'GBP',
			rate: 1,
			date: expect.any(String),
			provider: 'frankfurter',
			cached: true
		});
		expect(result.date <= '2099-01-01').toBe(true);
		expect(frankfurter.fetchRate).not.toHaveBeenCalled();
		expect(select).not.toHaveBeenCalled();
	});

	it('clamps future on to today before provider fetch', async () => {
		selectLimit.mockResolvedValue([]);
		const today = new Date().toISOString().slice(0, 10);
		frankfurter.fetchRate.mockResolvedValue({
			rate: 0.5,
			rateDate: today,
			url: `https://api.frankfurter.dev/v1/${today}?from=TRY&to=GBP`
		});
		const result = await service.getRate(
			{ from: 'TRY', to: 'GBP', on: '2099-12-31' },
			'req-1'
		);
		expect(frankfurter.fetchRate).toHaveBeenCalledWith(today, 'TRY', 'GBP');
		expect(result.date).toBe(today);
		expect(result.cached).toBe(false);
	});

	it('returns cache hit without calling provider a second time', async () => {
		selectLimit.mockResolvedValue([{ rate: 0.022, rateDate: '2026-03-13' }]);
		const first = await service.getRate(
			{ from: 'TRY', to: 'GBP', on: '2026-03-13' },
			'req-1'
		);
		expect(first.cached).toBe(true);
		expect(first.rate).toBe(0.022);
		expect(frankfurter.fetchRate).not.toHaveBeenCalled();

		const second = await service.getRate(
			{ from: 'TRY', to: 'GBP', on: '2026-03-13' },
			'req-2'
		);
		expect(second.cached).toBe(true);
		expect(frankfurter.fetchRate).not.toHaveBeenCalled();
		expect(select).toHaveBeenCalledTimes(2);
	});

	it('fetches, caches provider date, and returns uncached flag', async () => {
		selectLimit.mockResolvedValue([]);
		frankfurter.fetchRate.mockResolvedValue({
			rate: 0.022,
			rateDate: '2026-03-13',
			url: 'https://api.frankfurter.dev/v1/2026-03-14?from=TRY&to=GBP'
		});
		const result = await service.getRate(
			{ from: 'TRY', to: 'GBP', on: '2026-03-14' },
			'req-1'
		);
		expect(result).toEqual({
			from: 'TRY',
			to: 'GBP',
			rate: 0.022,
			date: '2026-03-13',
			provider: 'frankfurter',
			cached: false
		});
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				rateDate: '2026-03-13',
				fromCurrency: 'TRY',
				toCurrency: 'GBP',
				rate: 0.022,
				provider: 'frankfurter'
			})
		);
		expect(onConflictDoNothing).toHaveBeenCalled();
	});

	it('maps provider failure to BadGatewayException (not 500)', async () => {
		selectLimit.mockResolvedValue([]);
		frankfurter.fetchRate.mockRejectedValue(
			new FrankfurterProviderError(
				'rate_provider_error',
				502,
				'rate_provider_error_502_TRY_GBP',
				502
			)
		);
		await expect(
			service.getRate({ from: 'TRY', to: 'GBP', on: '2026-03-13' }, 'req-1')
		).rejects.toBeInstanceOf(BadGatewayException);
	});
});

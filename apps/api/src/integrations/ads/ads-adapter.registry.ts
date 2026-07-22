import { BadRequestException, Injectable } from '@nestjs/common';
import { adProviderSchema, type AdProvider } from '@verimaya/shared';
import { metaAdsAdapterFromEnv } from '../meta/meta-ads.adapter';
import { StubAdsAdapter } from './ads.stub-adapter';
import type { AdsProviderAdapter } from './ads.types';

/**
 * Resolves AdsProviderAdapter by provider.
 * meta → MetaAdsAdapter (RM-4b); google → Stub until RM-4c.
 */
@Injectable()
export class AdsAdapterRegistry {
	private readonly adapters = new Map<AdProvider, AdsProviderAdapter>([
		['meta', metaAdsAdapterFromEnv()],
		['google', new StubAdsAdapter('google')]
	]);

	/** Test helper: swap adapter without Nest DI. */
	replace(provider: AdProvider, adapter: AdsProviderAdapter): void {
		this.adapters.set(provider, adapter);
	}

	get(provider: AdProvider): AdsProviderAdapter {
		const adapter = this.adapters.get(provider);
		if (!adapter) {
			throw new BadRequestException({
				error: { code: 'invalid_provider', message: `Unknown ads provider: ${provider}` }
			});
		}
		return adapter;
	}

	parseProvider(raw: string): AdProvider {
		const parsed = adProviderSchema.safeParse(raw);
		if (!parsed.success) {
			throw new BadRequestException({
				error: {
					code: 'invalid_provider',
					message: 'provider must be meta or google'
				}
			});
		}
		return parsed.data;
	}
}

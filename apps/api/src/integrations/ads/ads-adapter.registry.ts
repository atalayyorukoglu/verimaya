import { BadRequestException, Injectable } from '@nestjs/common';
import { adProviderSchema, type AdProvider } from '@verimaya/shared';
import { StubAdsAdapter } from './ads.stub-adapter';
import type { AdsProviderAdapter } from './ads.types';

/**
 * Resolves AdsProviderAdapter by provider. Defaults to StubAdsAdapter for meta+google;
 * RM-4b/c will swap in real Meta/Google adapters.
 */
@Injectable()
export class AdsAdapterRegistry {
	private readonly adapters = new Map<AdProvider, AdsProviderAdapter>([
		['meta', new StubAdsAdapter('meta')],
		['google', new StubAdsAdapter('google')]
	]);

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

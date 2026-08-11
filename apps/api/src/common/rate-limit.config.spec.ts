import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
	isStrictAuthRateLimitedPath,
	parseTrustProxyEnv,
	skipStrictAuthRateLimit
} from './rate-limit.config';

describe('isStrictAuthRateLimitedPath', () => {
	it('covers credential-bearing better-auth routes', () => {
		expect(isStrictAuthRateLimitedPath('/v1/auth/sign-in/email')).toBe(true);
		expect(isStrictAuthRateLimitedPath('/v1/auth/sign-up/email')).toBe(true);
		expect(isStrictAuthRateLimitedPath('/v1/auth/request-password-reset')).toBe(true);
		expect(isStrictAuthRateLimitedPath('/v1/auth/reset-password')).toBe(true);
		expect(isStrictAuthRateLimitedPath('/v1/auth/reset-password/abc-token')).toBe(true);
		expect(isStrictAuthRateLimitedPath('/v1/auth/two-factor/verify-totp')).toBe(true);
		expect(isStrictAuthRateLimitedPath('/v1/auth/two-factor/verify-backup-code')).toBe(true);
		expect(isStrictAuthRateLimitedPath('/v1/auth/two-factor/verify-otp')).toBe(true);
	});

	it('does not cover session/org navigation reads', () => {
		expect(isStrictAuthRateLimitedPath('/v1/auth/get-session')).toBe(false);
		expect(isStrictAuthRateLimitedPath('/v1/auth/organization/list')).toBe(false);
		expect(isStrictAuthRateLimitedPath('/v1/auth/organization/set-active')).toBe(false);
		expect(isStrictAuthRateLimitedPath('/v1/auth/two-factor/enable')).toBe(false);
		expect(isStrictAuthRateLimitedPath('/v1/contacts')).toBe(false);
	});

	it('skipStrictAuthRateLimit mirrors allowList semantics (true = skip)', () => {
		expect(skipStrictAuthRateLimit({ url: '/v1/auth/get-session' })).toBe(true);
		expect(skipStrictAuthRateLimit({ url: '/v1/auth/sign-in/email?x=1' })).toBe(false);
	});
});

describe('parseTrustProxyEnv', () => {
	it('defaults off', () => {
		expect(parseTrustProxyEnv(undefined)).toBe(false);
		expect(parseTrustProxyEnv('')).toBe(false);
		expect(parseTrustProxyEnv('false')).toBe(false);
		expect(parseTrustProxyEnv('0')).toBe(false);
	});

	it('parses hop count and discouraged boolean true', () => {
		expect(parseTrustProxyEnv('1')).toBe(1);
		expect(parseTrustProxyEnv('2')).toBe(2);
		expect(parseTrustProxyEnv('true')).toBe(true);
	});

	it('parses CIDR / multi-proxy lists', () => {
		expect(parseTrustProxyEnv('172.16.0.0/12')).toBe('172.16.0.0/12');
		expect(parseTrustProxyEnv('172.16.0.0/12,10.0.0.0/8')).toEqual([
			'172.16.0.0/12',
			'10.0.0.0/8'
		]);
	});
});

describe('strict auth rate-limit (fastify)', () => {
	const apps: Array<ReturnType<typeof Fastify>> = [];
	afterEach(async () => {
		await Promise.all(apps.splice(0).map((a) => a.close()));
	});

	async function makeStrictApp() {
		const app = Fastify({ trustProxy: false });
		apps.push(app);
		await app.register(rateLimit, {
			global: true,
			max: 10,
			timeWindow: '1 minute',
			allowList: skipStrictAuthRateLimit
		});
		app.all('/v1/auth/*', async () => ({ ok: true }));
		await app.ready();
		return app;
	}

	it('does not 429 get-session after >10 hits; does 429 sign-in/email', async () => {
		const app = await makeStrictApp();

		for (let i = 0; i < 15; i++) {
			const res = await app.inject({ method: 'GET', url: '/v1/auth/get-session' });
			expect(res.statusCode).toBe(200);
		}

		let last = 200;
		for (let i = 0; i < 11; i++) {
			const res = await app.inject({
				method: 'POST',
				url: '/v1/auth/sign-in/email',
				payload: { email: 'a@b.co', password: 'x' }
			});
			last = res.statusCode;
			if (i < 10) expect(res.statusCode).toBe(200);
		}
		expect(last).toBe(429);
	});
});

describe('trustProxy off ignores forged X-Forwarded-For', () => {
	it('keeps rate-limit key on socket peer when TRUST_PROXY is off', async () => {
		const app = Fastify({ trustProxy: false });
		await app.register(rateLimit, {
			global: true,
			max: 2,
			timeWindow: '1 minute'
		});
		app.get('/ping', async () => ({ ok: true }));
		await app.ready();

		const peer = '10.0.0.50';
		const r1 = await app.inject({
			method: 'GET',
			url: '/ping',
			remoteAddress: peer,
			headers: { 'x-forwarded-for': '203.0.113.10' }
		});
		const r2 = await app.inject({
			method: 'GET',
			url: '/ping',
			remoteAddress: peer,
			headers: { 'x-forwarded-for': '203.0.113.11' }
		});
		const r3 = await app.inject({
			method: 'GET',
			url: '/ping',
			remoteAddress: peer,
			headers: { 'x-forwarded-for': '203.0.113.12' }
		});

		expect(r1.statusCode).toBe(200);
		expect(r2.statusCode).toBe(200);
		// Third hit with a different forged XFF still shares the peer bucket → 429.
		expect(r3.statusCode).toBe(429);

		await app.close();
	});
});

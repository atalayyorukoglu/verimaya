import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
	createRateLimitKeyGenerator,
	isCspReportRateLimitedPath,
	isPlausibleClientIp,
	isStrictAuthRateLimitedPath,
	parseTrustCfConnectingIpEnv,
	parseTrustProxyEnv,
	readCfConnectingIp,
	skipCspReportRateLimit,
	skipStrictAuthRateLimit
} from './rate-limit.config';

describe('isStrictAuthRateLimitedPath', () => {
	it('covers credential-bearing better-auth routes', () => {
		expect(isStrictAuthRateLimitedPath('/v1/auth/sign-in/email')).toBe(true);
		expect(isStrictAuthRateLimitedPath('/v1/auth/sign-up/email')).toBe(true);
		expect(isStrictAuthRateLimitedPath('/v1/auth/request-password-reset')).toBe(true);
		expect(isStrictAuthRateLimitedPath('/v1/auth/reset-password')).toBe(true);
		expect(isStrictAuthRateLimitedPath('/v1/auth/reset-password/abc-token')).toBe(true);
		expect(isStrictAuthRateLimitedPath('/v1/auth/change-password')).toBe(true);
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

describe('CSP report ingest rate-limit path', () => {
	it('only POST /v1/csp-reports hits the dedicated bucket', () => {
		expect(isCspReportRateLimitedPath('/v1/csp-reports')).toBe(true);
		expect(skipCspReportRateLimit({ url: '/v1/csp-reports', method: 'POST' })).toBe(false);
		expect(skipCspReportRateLimit({ url: '/v1/csp-reports', method: 'GET' })).toBe(true);
		expect(skipCspReportRateLimit({ url: '/v1/contacts', method: 'POST' })).toBe(true);
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

describe('parseTrustCfConnectingIpEnv', () => {
	it('defaults off and fails closed on unknown', () => {
		expect(parseTrustCfConnectingIpEnv(undefined)).toBe(false);
		expect(parseTrustCfConnectingIpEnv('')).toBe(false);
		expect(parseTrustCfConnectingIpEnv('false')).toBe(false);
		expect(parseTrustCfConnectingIpEnv('0')).toBe(false);
		expect(parseTrustCfConnectingIpEnv('maybe')).toBe(false);
	});

	it('accepts true / on / 1', () => {
		expect(parseTrustCfConnectingIpEnv('true')).toBe(true);
		expect(parseTrustCfConnectingIpEnv('ON')).toBe(true);
		expect(parseTrustCfConnectingIpEnv('1')).toBe(true);
	});
});

describe('readCfConnectingIp / isPlausibleClientIp', () => {
	it('accepts IPv4 and IPv6; rejects junk', () => {
		expect(isPlausibleClientIp('203.0.113.10')).toBe(true);
		expect(isPlausibleClientIp('2001:db8::1')).toBe(true);
		expect(isPlausibleClientIp('not-an-ip')).toBe(false);
		expect(isPlausibleClientIp('')).toBe(false);
	});

	it('takes first token and rejects empty/invalid', () => {
		expect(readCfConnectingIp({ 'cf-connecting-ip': '203.0.113.10' })).toBe('203.0.113.10');
		expect(readCfConnectingIp({ 'cf-connecting-ip': '203.0.113.10, 198.51.100.1' })).toBe(
			'203.0.113.10'
		);
		expect(readCfConnectingIp({ 'cf-connecting-ip': ['203.0.113.99'] })).toBe('203.0.113.99');
		expect(readCfConnectingIp({})).toBeUndefined();
		expect(readCfConnectingIp({ 'cf-connecting-ip': '  ' })).toBeUndefined();
		expect(readCfConnectingIp({ 'cf-connecting-ip': 'not-an-ip' })).toBeUndefined();
	});
});

describe('createRateLimitKeyGenerator', () => {
	it('ignores CF-Connecting-IP when trust flag is off', () => {
		const key = createRateLimitKeyGenerator(false);
		expect(
			key({
				ip: '10.0.0.50',
				headers: { 'cf-connecting-ip': '203.0.113.10' }
			})
		).toBe('10.0.0.50');
	});

	it('uses CF-Connecting-IP when trust flag is on', () => {
		const key = createRateLimitKeyGenerator(true);
		expect(
			key({
				ip: '172.68.205.204',
				headers: { 'cf-connecting-ip': '203.0.113.10' }
			})
		).toBe('203.0.113.10');
	});

	it('falls back to req.ip when header missing or invalid', () => {
		const key = createRateLimitKeyGenerator(true);
		expect(key({ ip: '172.68.205.204', headers: {} })).toBe('172.68.205.204');
		expect(
			key({
				ip: '172.68.205.204',
				headers: { 'cf-connecting-ip': 'garbage' }
			})
		).toBe('172.68.205.204');
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

	it('does 429 change-password after the strict 10/min bucket', async () => {
		const app = await makeStrictApp();
		let last = 200;
		for (let i = 0; i < 11; i++) {
			const res = await app.inject({
				method: 'POST',
				url: '/v1/auth/change-password',
				payload: { currentPassword: 'x', newPassword: 'yyyyyyyy' }
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

describe('TRUST_CF_CONNECTING_IP rate-limit keying (fastify)', () => {
	const apps: Array<ReturnType<typeof Fastify>> = [];
	afterEach(async () => {
		await Promise.all(apps.splice(0).map((a) => a.close()));
	});

	async function makeApp(trustCf: boolean) {
		const app = Fastify({ trustProxy: false });
		apps.push(app);
		await app.register(rateLimit, {
			global: true,
			max: 2,
			timeWindow: '1 minute',
			keyGenerator: createRateLimitKeyGenerator(trustCf)
		});
		app.get('/ping', async () => ({ ok: true }));
		await app.ready();
		return app;
	}

	it('flag off: forged CF-Connecting-IP does not change the bucket', async () => {
		const app = await makeApp(false);
		const peer = '10.0.0.50';

		const r1 = await app.inject({
			method: 'GET',
			url: '/ping',
			remoteAddress: peer,
			headers: { 'cf-connecting-ip': '203.0.113.10' }
		});
		const r2 = await app.inject({
			method: 'GET',
			url: '/ping',
			remoteAddress: peer,
			headers: { 'cf-connecting-ip': '203.0.113.11' }
		});
		const r3 = await app.inject({
			method: 'GET',
			url: '/ping',
			remoteAddress: peer,
			headers: { 'cf-connecting-ip': '203.0.113.12' }
		});

		expect(r1.statusCode).toBe(200);
		expect(r2.statusCode).toBe(200);
		// Forged CF header ignored → same peer bucket → 429 on third hit.
		expect(r3.statusCode).toBe(429);
	});

	it('flag on: two client IPs get separate buckets', async () => {
		const app = await makeApp(true);
		const edge = '172.68.205.204';

		for (let i = 0; i < 2; i++) {
			const res = await app.inject({
				method: 'GET',
				url: '/ping',
				remoteAddress: edge,
				headers: { 'cf-connecting-ip': '203.0.113.10' }
			});
			expect(res.statusCode).toBe(200);
		}
		const limited = await app.inject({
			method: 'GET',
			url: '/ping',
			remoteAddress: edge,
			headers: { 'cf-connecting-ip': '203.0.113.10' }
		});
		expect(limited.statusCode).toBe(429);

		// Different CF client IP → fresh bucket despite same edge peer.
		const other = await app.inject({
			method: 'GET',
			url: '/ping',
			remoteAddress: edge,
			headers: { 'cf-connecting-ip': '198.51.100.20' }
		});
		expect(other.statusCode).toBe(200);
	});

	it('flag on: missing/invalid header falls back to req.ip', async () => {
		const app = await makeApp(true);
		const peer = '10.0.0.77';

		const r1 = await app.inject({
			method: 'GET',
			url: '/ping',
			remoteAddress: peer
		});
		const r2 = await app.inject({
			method: 'GET',
			url: '/ping',
			remoteAddress: peer,
			headers: { 'cf-connecting-ip': 'not-an-ip' }
		});
		const r3 = await app.inject({
			method: 'GET',
			url: '/ping',
			remoteAddress: peer,
			headers: { 'cf-connecting-ip': '' }
		});

		expect(r1.statusCode).toBe(200);
		expect(r2.statusCode).toBe(200);
		expect(r3.statusCode).toBe(429);
	});
});

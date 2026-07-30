import { describe, expect, it, vi } from 'vitest';
import { RoutingFileStorage } from './routing-file.storage';
import type { LocalFileStorage } from './local-file.storage';
import type { S3FileStorage } from './s3-file.storage';

function mockLocal(): LocalFileStorage {
	return {
		buildKey: vi.fn(
			(t: string, p: string, f: string) => `local://${t}/${p}/${f}`
		),
		put: vi.fn(),
		getStream: vi.fn(),
		exists: vi.fn(),
		stat: vi.fn(),
		remove: vi.fn(),
		signedGetUrl: vi.fn(async () => null),
		signedPutUrl: vi.fn(async () => null)
	} as unknown as LocalFileStorage;
}

function mockS3(): S3FileStorage {
	return {
		buildKey: vi.fn((t: string, p: string, f: string) => `s3://${t}/${p}/${f}`),
		put: vi.fn(),
		getStream: vi.fn(),
		exists: vi.fn(),
		stat: vi.fn(),
		remove: vi.fn(),
		signedGetUrl: vi.fn(async () => 'https://signed.get'),
		signedPutUrl: vi.fn(async () => 'https://signed.put')
	} as unknown as S3FileStorage;
}

describe('RoutingFileStorage', () => {
	it('buildKey follows default driver', () => {
		const local = mockLocal();
		const s3 = mockS3();
		const localDefault = new RoutingFileStorage(local, s3, 'local');
		expect(localDefault.buildKey('t', 'p', 'f')).toBe('local://t/p/f');
		expect(local.buildKey).toHaveBeenCalled();

		const s3Default = new RoutingFileStorage(local, s3, 's3');
		expect(s3Default.buildKey('t', 'p', 'f')).toBe('s3://t/p/f');
		expect(s3.buildKey).toHaveBeenCalled();
	});

	it('routes put/exists by key scheme', async () => {
		const local = mockLocal();
		const s3 = mockS3();
		const storage = new RoutingFileStorage(local, s3, 'local');
		const buf = Buffer.from('x');

		await storage.put('local://t/p/f', buf, { contentType: 'text/plain' });
		expect(local.put).toHaveBeenCalledWith('local://t/p/f', buf, {
			contentType: 'text/plain'
		});
		expect(s3.put).not.toHaveBeenCalled();

		await storage.exists('s3://t/p/f');
		expect(s3.exists).toHaveBeenCalledWith('s3://t/p/f');
		expect(local.exists).not.toHaveBeenCalled();
	});

	it('throws when s3 key used without S3 adapter', async () => {
		const storage = new RoutingFileStorage(mockLocal(), null, 'local');
		await expect(storage.exists('s3://t/p/f')).rejects.toThrow(/S3 is not configured/);
	});

	it('rejects unknown schemes', async () => {
		const storage = new RoutingFileStorage(mockLocal(), mockS3(), 'local');
		await expect(storage.exists('gs://bucket/key')).rejects.toThrow(/Unknown storage key/);
	});
});

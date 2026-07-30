import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_PRESIGN_TTL_SECONDS,
	resolveS3ObjectKey,
	S3FileStorage,
	type S3FileStorageConfig
} from './s3-file.storage';

const config: S3FileStorageConfig = {
	endpoint: 'https://example.r2.cloudflarestorage.com',
	region: 'auto',
	bucket: 'verimaya-files',
	accessKeyId: 'test-key',
	secretAccessKey: 'test-secret',
	forcePathStyle: true
};

describe('resolveS3ObjectKey', () => {
	it('parses three-part s3 keys', () => {
		expect(
			resolveS3ObjectKey(
				's3://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/pppppppp-pppp-pppp-pppp-pppppppppppp/ffffffff-ffff-ffff-ffff-ffffffffffff'
			)
		).toBe(
			'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/pppppppp-pppp-pppp-pppp-pppppppppppp/ffffffff-ffff-ffff-ffff-ffffffffffff'
		);
	});

	it('rejects pending, wrong scheme, and traversal', () => {
		expect(resolveS3ObjectKey('s3://pending')).toBeNull();
		expect(resolveS3ObjectKey('local://a/b/c')).toBeNull();
		expect(resolveS3ObjectKey('s3://a/b/../c')).toBeNull();
		expect(resolveS3ObjectKey('s3://only/two')).toBeNull();
	});
});

describe('S3FileStorage', () => {
	it('buildKey uses s3 scheme and three path segments', () => {
		const storage = new S3FileStorage(config, {
			client: { send: vi.fn() } as unknown as S3Client
		});
		expect(storage.buildKey('t1', 'p1', 'f1')).toBe('s3://t1/p1/f1');
	});

	it('signedGetUrl and signedPutUrl pass default 5-minute TTL to signer', async () => {
		const getSignedUrl = vi.fn(async () => 'https://signed.example/obj');
		const storage = new S3FileStorage(config, {
			client: { send: vi.fn() } as unknown as S3Client,
			getSignedUrl
		});

		const getUrl = await storage.signedGetUrl('s3://t/p/f');
		const putUrl = await storage.signedPutUrl('s3://t/p/f');

		expect(getUrl).toBe('https://signed.example/obj');
		expect(putUrl).toBe('https://signed.example/obj');
		expect(getSignedUrl).toHaveBeenCalledTimes(2);

		const getCall = getSignedUrl.mock.calls[0]!;
		const putCall = getSignedUrl.mock.calls[1]!;
		expect(getCall[2]).toEqual({ expiresIn: DEFAULT_PRESIGN_TTL_SECONDS });
		expect(putCall[2]).toEqual({ expiresIn: DEFAULT_PRESIGN_TTL_SECONDS });
		expect(getCall[1]).toBeInstanceOf(GetObjectCommand);
		expect(putCall[1]).toBeInstanceOf(PutObjectCommand);
		expect(DEFAULT_PRESIGN_TTL_SECONDS).toBe(300);
	});

	it('signed* respects explicit ttl and returns null for invalid keys', async () => {
		const getSignedUrl = vi.fn(async () => 'https://signed.example/obj');
		const storage = new S3FileStorage(config, {
			client: { send: vi.fn() } as unknown as S3Client,
			getSignedUrl
		});

		expect(await storage.signedGetUrl('local://t/p/f')).toBeNull();
		expect(await storage.signedPutUrl('s3://pending')).toBeNull();
		expect(getSignedUrl).not.toHaveBeenCalled();

		await storage.signedPutUrl('s3://t/p/f', 120);
		expect(getSignedUrl.mock.calls[0]![2]).toEqual({ expiresIn: 120 });
	});
});

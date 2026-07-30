import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import type { FileObjectStat, FilePutMeta, FileStoragePort } from './storage.types';
import { DEFAULT_PRESIGN_TTL_SECONDS } from './storage.types';

const S3_SCHEME = 's3://';

export { DEFAULT_PRESIGN_TTL_SECONDS };

export type S3FileStorageConfig = {
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	forcePathStyle: boolean;
};

export type S3SignedUrlFn = (
	client: S3Client,
	command: PutObjectCommand | GetObjectCommand,
	options: { expiresIn: number }
) => Promise<string>;

/**
 * Parse `s3://{tenantId}/{patientId}/{fileId}` → object key.
 * Rejects pending, wrong scheme, traversal, or wrong segment count.
 */
export function resolveS3ObjectKey(storageKey: string): string | null {
	if (!storageKey.startsWith(S3_SCHEME)) return null;
	const relative = storageKey.slice(S3_SCHEME.length);
	if (!relative || relative === 'pending') return null;
	if (relative.includes('..')) return null;

	const parts = relative.split('/').filter(Boolean);
	if (parts.length !== 3) return null;
	if (parts.some((p) => p.includes('..') || p.includes('\\'))) return null;

	return parts.join('/');
}

export function readS3ConfigFromEnv(): S3FileStorageConfig {
	const endpoint = process.env.S3_ENDPOINT?.trim();
	const bucket = process.env.S3_BUCKET?.trim();
	const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
	const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
	const region = process.env.S3_REGION?.trim() || 'auto';

	if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
		throw new Error(
			'STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY'
		);
	}

	const forceRaw = process.env.S3_FORCE_PATH_STYLE?.trim().toLowerCase();
	const forcePathStyle = forceRaw !== 'false' && forceRaw !== '0';

	return { endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle };
}

/**
 * Cloudflare R2 / S3-compatible object storage.
 * Bucket must stay private — access only via this adapter (proxy stream or presigned URL).
 */
export class S3FileStorage implements FileStoragePort {
	private readonly client: S3Client;
	private readonly signUrl: S3SignedUrlFn;

	constructor(
		private readonly config: S3FileStorageConfig,
		deps?: { client?: S3Client; getSignedUrl?: S3SignedUrlFn }
	) {
		this.client =
			deps?.client ??
			new S3Client({
				region: config.region,
				endpoint: config.endpoint,
				forcePathStyle: config.forcePathStyle,
				credentials: {
					accessKeyId: config.accessKeyId,
					secretAccessKey: config.secretAccessKey
				}
			});
		this.signUrl = deps?.getSignedUrl ?? getSignedUrl;
	}

	buildKey(tenantId: string, patientId: string, fileId: string): string {
		return `${S3_SCHEME}${tenantId}/${patientId}/${fileId}`;
	}

	async put(key: string, buf: Buffer, meta?: FilePutMeta): Promise<void> {
		const objectKey = requireObjectKey(key);
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.config.bucket,
				Key: objectKey,
				Body: buf,
				ContentType: meta?.contentType,
				ContentDisposition: meta?.filename
					? `attachment; filename="${meta.filename.replace(/"/g, '')}"`
					: undefined
			})
		);
	}

	async getStream(key: string): Promise<Readable | null> {
		const objectKey = resolveS3ObjectKey(key);
		if (!objectKey) return null;
		try {
			const out = await this.client.send(
				new GetObjectCommand({
					Bucket: this.config.bucket,
					Key: objectKey
				})
			);
			const body = out.Body;
			if (!body) return null;
			// Node.js runtime: Body is a Readable stream
			return body as Readable;
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}
	}

	async exists(key: string): Promise<boolean> {
		const objectKey = resolveS3ObjectKey(key);
		if (!objectKey) return false;
		try {
			await this.client.send(
				new HeadObjectCommand({
					Bucket: this.config.bucket,
					Key: objectKey
				})
			);
			return true;
		} catch (err) {
			if (isNotFound(err)) return false;
			throw err;
		}
	}

	async stat(key: string): Promise<FileObjectStat | null> {
		const objectKey = resolveS3ObjectKey(key);
		if (!objectKey) return null;
		try {
			const out = await this.client.send(
				new HeadObjectCommand({
					Bucket: this.config.bucket,
					Key: objectKey
				})
			);
			return {
				sizeBytes: Number(out.ContentLength ?? 0),
				contentType: out.ContentType ?? null
			};
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}
	}

	async remove(key: string): Promise<void> {
		const objectKey = resolveS3ObjectKey(key);
		if (!objectKey) return;
		try {
			await this.client.send(
				new DeleteObjectCommand({
					Bucket: this.config.bucket,
					Key: objectKey
				})
			);
		} catch (err) {
			if (isNotFound(err)) return;
			throw err;
		}
	}

	async signedGetUrl(
		key: string,
		ttlSeconds: number = DEFAULT_PRESIGN_TTL_SECONDS
	): Promise<string | null> {
		const objectKey = resolveS3ObjectKey(key);
		if (!objectKey) return null;
		const expiresIn = normalizeTtl(ttlSeconds);
		return this.signUrl(
			this.client,
			new GetObjectCommand({
				Bucket: this.config.bucket,
				Key: objectKey
			}),
			{ expiresIn }
		);
	}

	async signedPutUrl(
		key: string,
		ttlSeconds: number = DEFAULT_PRESIGN_TTL_SECONDS
	): Promise<string | null> {
		const objectKey = resolveS3ObjectKey(key);
		if (!objectKey) return null;
		const expiresIn = normalizeTtl(ttlSeconds);
		return this.signUrl(
			this.client,
			new PutObjectCommand({
				Bucket: this.config.bucket,
				Key: objectKey
			}),
			{ expiresIn }
		);
	}
}

function requireObjectKey(storageKey: string): string {
	const objectKey = resolveS3ObjectKey(storageKey);
	if (!objectKey) {
		throw new Error(`Invalid s3 storage key: ${storageKey}`);
	}
	return objectKey;
}

function normalizeTtl(ttlSeconds: number): number {
	if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
		return DEFAULT_PRESIGN_TTL_SECONDS;
	}
	return Math.trunc(ttlSeconds);
}

function isNotFound(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false;
	const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
	return (
		e.name === 'NotFound' ||
		e.name === 'NoSuchKey' ||
		e.$metadata?.httpStatusCode === 404
	);
}

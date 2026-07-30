import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLocalFilePath } from './local-file.storage';

describe('resolveLocalFilePath', () => {
	const prev = process.env.UPLOAD_DIR;

	afterEach(() => {
		if (prev === undefined) delete process.env.UPLOAD_DIR;
		else process.env.UPLOAD_DIR = prev;
	});

	it('resolves a three-part local key under UPLOAD_DIR', () => {
		process.env.UPLOAD_DIR = '/tmp/verimaya-uploads-test';
		const abs = resolveLocalFilePath(
			'local://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/pppppppp-pppp-pppp-pppp-pppppppppppp/ffffffff-ffff-ffff-ffff-ffffffffffff'
		);
		expect(abs).toBe(
			path.resolve(
				'/tmp/verimaya-uploads-test',
				'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
				'pppppppp-pppp-pppp-pppp-pppppppppppp',
				'ffffffff-ffff-ffff-ffff-ffffffffffff'
			)
		);
	});

	it('rejects path traversal and pending/non-local keys', () => {
		process.env.UPLOAD_DIR = '/tmp/verimaya-uploads-test';
		expect(resolveLocalFilePath('local://pending')).toBeNull();
		expect(resolveLocalFilePath('s3://bucket/key')).toBeNull();
		expect(resolveLocalFilePath('local://a/b/../c')).toBeNull();
		expect(resolveLocalFilePath('local:///etc/passwd')).toBeNull();
		expect(resolveLocalFilePath('local://only/two')).toBeNull();
	});
});

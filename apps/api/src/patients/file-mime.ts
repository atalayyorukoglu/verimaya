import { UnsupportedMediaTypeException } from '@nestjs/common';
import {
	isAllowedPatientFileMimeType,
	normalizePatientFileMimeType
} from '@verimaya/shared';
import { fromBuffer } from 'file-type';

/**
 * AUDIT-F09-08: magic-byte MIME choke point for patient file uploads.
 *
 * Error codes:
 * - `unsupported_media_type` (415) — declared MIME outside allowlist, or sniff returns
 *   undefined (every allowlisted type has detectable magic bytes).
 * - `mime_mismatch` (415) — sniffed MIME !== normalized declared MIME (e.g. PNG bytes
 *   uploaded with `application/pdf`). Prefer 415 over 400: the request Content-Type /
 *   declared type is unsupported relative to the actual payload.
 */
export async function assertUploadMimeMatchesBytes(
	data: Buffer,
	declaredMime: string
): Promise<string> {
	const declared = normalizePatientFileMimeType(declaredMime);
	if (!isAllowedPatientFileMimeType(declared)) {
		throw new UnsupportedMediaTypeException({
			error: {
				code: 'unsupported_media_type',
				message: `MIME type not allowed: ${declared || declaredMime || '(empty)'}`
			}
		});
	}

	let detected: { mime: string } | undefined;
	try {
		detected = await fromBuffer(data);
	} catch {
		// Truncated / empty buffers throw (e.g. EndOfStreamError) — treat as undetectable.
		detected = undefined;
	}
	if (!detected?.mime) {
		throw new UnsupportedMediaTypeException({
			error: {
				code: 'unsupported_media_type',
				message: 'Could not detect file type from content'
			}
		});
	}

	const sniffed = normalizePatientFileMimeType(detected.mime);
	if (sniffed !== declared) {
		throw new UnsupportedMediaTypeException({
			error: {
				code: 'mime_mismatch',
				message: `Declared MIME ${declared} does not match content type ${sniffed}`
			}
		});
	}

	return declared;
}

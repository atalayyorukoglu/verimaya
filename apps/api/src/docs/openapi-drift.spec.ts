/**
 * AUDIT-F09-01: committed openapi.yaml must match generation from apiContract.
 * Shares the Node generator with `scripts/generate-openapi.js` (no duplicate logic).
 *
 * Loads the generator + shared via createRequire so vitest does not mix
 * CJS require('@verimaya/shared') (dist) with ESM source resolution.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
	loadApiContract,
	generateOpenApiYaml,
	generateOpenApiDocument,
	countOperations,
	diffOpenApiOperations
} = require('../../scripts/generate-openapi-core.js');
const YAML = require('yaml');
const apiContract = loadApiContract();

const COMMITTED_YAML_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../openapi.yaml');

describe('AUDIT-F09-01: openapi.yaml generated from apiContract', () => {
	const generatedYaml = generateOpenApiYaml(apiContract);
	const generatedDoc = generateOpenApiDocument(apiContract);
	const routeCount = Object.keys(apiContract).length;

	it('produces valid OpenAPI 3.x YAML with one operation per contract route', () => {
		expect(generatedDoc.openapi.startsWith('3.')).toBe(true);
		expect(countOperations(generatedDoc)).toBe(routeCount);

		const parsed = YAML.parse(generatedYaml);
		expect(parsed).toBeTruthy();
		expect(typeof parsed).toBe('object');
		expect(String(parsed.openapi)).toMatch(/^3\./);
		expect(countOperations(parsed)).toBe(routeCount);
	});

	it('committed openapi.yaml matches in-memory generation (byte-for-byte)', () => {
		const committed = readFileSync(COMMITTED_YAML_PATH, 'utf8');
		if (committed === generatedYaml) {
			expect(committed).toBe(generatedYaml);
			return;
		}

		let committedDoc: ReturnType<typeof generateOpenApiDocument>;
		try {
			committedDoc = YAML.parse(committed);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(
				`Committed openapi.yaml is not valid YAML / does not match generator output.\nParse error: ${message}`
			);
		}

		const routeDiffs = diffOpenApiOperations(generatedDoc, committedDoc);
		const detail =
			routeDiffs.length > 0
				? routeDiffs.join('\n  - ')
				: 'operation keys match but YAML text differs (formatting or info/servers drift)';
		throw new Error(
			`openapi.yaml is stale relative to apiContract. Run: pnpm --filter @verimaya/api openapi:generate\n` +
				`  - ${detail}`
		);
	});
});

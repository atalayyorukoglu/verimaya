#!/usr/bin/env node
/**
 * Regenerate apps/api/openapi.yaml from @verimaya/shared apiContract.
 *
 * Usage: pnpm --filter @verimaya/api openapi:generate
 *
 * Requires @verimaya/shared dist (CI runs shared build first).
 */

const fs = require('node:fs');
const path = require('node:path');
const {
	loadApiContract,
	generateOpenApiYaml,
	generateOpenApiDocument,
	countOperations
} = require('./generate-openapi-core.js');

const apiContract = loadApiContract();
const outPath = path.join(__dirname, '..', 'openapi.yaml');
const yaml = generateOpenApiYaml(apiContract);
const doc = generateOpenApiDocument(apiContract);
const routeCount = Object.keys(apiContract).length;
const opCount = countOperations(doc);

if (opCount !== routeCount) {
	console.error(
		`OpenAPI operation count (${opCount}) !== apiContract route count (${routeCount})`
	);
	process.exit(1);
}

fs.writeFileSync(outPath, yaml, 'utf8');
console.log(`Wrote ${outPath} (${opCount} operations from apiContract)`);

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const OPENAPI_YAML_PATH = '/v1/openapi.yaml';
export const OPENAPI_DOCS_PATH = '/v1/docs';

function resolveOpenApiYamlPath(): string | null {
	const candidates = [
		join(process.cwd(), 'openapi.yaml'),
		join(process.cwd(), 'apps/api/openapi.yaml'),
		join(__dirname, '../../openapi.yaml'),
		join(__dirname, '../../../openapi.yaml')
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

function docsHtml(specUrl: string): string {
	return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Verimaya API</title>
  <style>body { margin: 0; }</style>
</head>
<body>
  <script
    id="api-reference"
    data-url="${specUrl}"
    data-configuration='{"theme":"default"}'
  ></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
}

/**
 * Read-only public OpenAPI + Scalar UI.
 * Mounted on Fastify directly (outside Nest global prefix guards).
 */
export async function mountOpenApiDocs(app: NestFastifyApplication): Promise<void> {
	const yamlPath = resolveOpenApiYamlPath();
	if (!yamlPath) {
		app.getHttpAdapter().getInstance().log.warn(
			'openapi.yaml not found — /v1/docs and /v1/openapi.yaml will not be served'
		);
		return;
	}

	const yaml = readFileSync(yamlPath, 'utf8');
	const fastify = app.getHttpAdapter().getInstance();

	fastify.get(OPENAPI_YAML_PATH, async (_request: FastifyRequest, reply: FastifyReply) => {
		return reply
			.header('content-type', 'application/yaml; charset=utf-8')
			.header('cache-control', 'public, max-age=60')
			.send(yaml);
	});

	fastify.get(OPENAPI_DOCS_PATH, async (_request: FastifyRequest, reply: FastifyReply) => {
		return reply
			.header('content-type', 'text/html; charset=utf-8')
			.header('cache-control', 'public, max-age=60')
			.send(docsHtml(OPENAPI_YAML_PATH));
	});
}

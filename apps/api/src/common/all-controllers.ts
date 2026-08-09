/**
 * Shared controller discovery for reflection coverage specs (guard / api-paths /
 * idempotency). Scans every `*.controller.ts` under `apps/api/src` and collects
 * exports that carry Nest PATH_METADATA (`@Controller()`), so new controllers
 * cannot silently drop out of a hand-maintained list.
 *
 * Vite `import.meta.glob` works under vitest but is rejected by Nest's CommonJS
 * `tsc` (`pnpm lint`) — hence fs walk + dynamic import instead.
 */
import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard } from './active-org.guard';
import { AuthOrApiKeyGuard } from './auth-or-api-key.guard';
import { OrgPermissionGuard } from './org-permission.guard';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- Nest controllers are class constructors
export type ControllerClass = Function;

function walkControllerFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			walkControllerFiles(full, out);
			continue;
		}
		if (
			!entry.isFile() ||
			!entry.name.endsWith('.controller.ts') ||
			entry.name.includes('.spec.') ||
			entry.name.includes('.test.')
		) {
			continue;
		}
		out.push(full);
	}
	return out;
}

function isControllerClass(value: unknown): value is ControllerClass {
	return typeof value === 'function' && Reflect.getMetadata(PATH_METADATA, value) !== undefined;
}

/** Every Nest `@Controller` class under `src/`, sorted by class name (stable). */
export async function discoverAllControllers(): Promise<ControllerClass[]> {
	const srcRoot = join(__dirname, '..');
	const files = walkControllerFiles(srcRoot).sort();
	const byName = new Map<string, ControllerClass>();

	for (const file of files) {
		const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
		for (const value of Object.values(mod)) {
			if (!isControllerClass(value)) continue;
			byName.set(value.name, value);
		}
	}

	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type GuardCtor = new (...args: never[]) => unknown;

/** Class + method guard metadata merged the way Nest merges it (getAllAndMerge). */
export function effectiveGuards(controller: ControllerClass, handler: Function): GuardCtor[] {
	const classGuards =
		(Reflect.getMetadata(GUARDS_METADATA, controller) as GuardCtor[] | undefined) ?? [];
	const methodGuards =
		(Reflect.getMetadata(GUARDS_METADATA, handler) as GuardCtor[] | undefined) ?? [];
	return [...classGuards, ...methodGuards];
}

export function guardNames(guards: GuardCtor[] | undefined): string[] {
	return (guards ?? []).map((g) => g.name);
}

/**
 * Org-auth triad: an auth entry (AuthOrApiKeyGuard *or* SessionGuard — both are used
 * in-repo) followed by ActiveOrgGuard + OrgPermissionGuard.
 */
export function hasOrgAuthTriad(guards: GuardCtor[]): boolean {
	const names = new Set(guardNames(guards));
	const hasAuthEntry = names.has(AuthOrApiKeyGuard.name) || names.has(SessionGuard.name);
	return hasAuthEntry && names.has(ActiveOrgGuard.name) && names.has(OrgPermissionGuard.name);
}

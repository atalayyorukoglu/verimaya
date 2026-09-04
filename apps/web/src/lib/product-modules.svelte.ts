/**
 * Toggleable modules for the Araçlar sidebar group.
 * Server truth: `GET /v1/me` → `preferences.enabled_product_modules`.
 * localStorage remains an optimistic cache so the sidebar does not flash empty on mount.
 */

import type { Component } from 'svelte';
import type { FeatureModule, ProductModuleId } from '@verimaya/shared';
import {
	PRODUCT_MODULE_IDS,
	DEFAULT_ENABLED_PRODUCT_MODULE_IDS,
	filterKnownProductModuleIds,
	type UserUiPreferences
} from '@verimaya/shared';
import type { QueryClient } from '@tanstack/svelte-query';
import Megaphone from '@lucide/svelte/icons/megaphone';
import UserRoundX from '@lucide/svelte/icons/user-round-x';
import ChartColumnIncreasing from '@lucide/svelte/icons/chart-column-increasing';
import Share2 from '@lucide/svelte/icons/share-2';
import ListChecks from '@lucide/svelte/icons/list-checks';
import Target from '@lucide/svelte/icons/target';

import { apiPaths, apiSend } from '$lib/api';
import type { MessageKey } from '$lib/i18n/messages';
import type { NavItem } from '$lib/navigation';

const STORAGE_KEY = 'verimaya:product-modules';

export type ProductModule = {
	id: ProductModuleId;
	labelKey: MessageKey;
	href: string;
	icon: Component;
	/** Matches `Feature.module` / Araçlar section heading. */
	department: FeatureModule;
};

const CATALOG_BY_ID: Record<ProductModuleId, Omit<ProductModule, 'id'>> = {
	'campaign-assistant': {
		labelKey: 'nav.campaignAssistant',
		href: '/marketing',
		icon: Megaphone,
		department: 'Pazarlama'
	},
	'untouched-contacts': {
		labelKey: 'reports.untouched.title',
		href: '/untouched',
		icon: UserRoundX,
		department: 'Raporlama'
	},
	cohorts: {
		labelKey: 'reports.cohorts.title',
		href: '/cohorts',
		icon: ChartColumnIncreasing,
		department: 'Raporlama'
	},
	'referral-value': {
		labelKey: 'reports.referrals.title',
		href: '/referrals',
		icon: Share2,
		department: 'Raporlama'
	},
	interventions: {
		labelKey: 'reports.interventions.title',
		href: '/interventions',
		icon: ListChecks,
		department: 'Raporlama'
	},
	'ai-accuracy': {
		labelKey: 'reports.aiAccuracy.title',
		href: '/ai-accuracy',
		icon: Target,
		department: 'Raporlama'
	}
};

/** Single catalog of modules that can appear under Araçlar when enabled. */
export const PRODUCT_MODULE_CATALOG: readonly ProductModule[] = PRODUCT_MODULE_IDS.map((id) => ({
	id,
	...CATALOG_BY_ID[id]
}));

function readStoredEnabledIds(): ProductModuleId[] {
	if (typeof localStorage === 'undefined') return [...DEFAULT_ENABLED_PRODUCT_MODULE_IDS];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [...DEFAULT_ENABLED_PRODUCT_MODULE_IDS];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [...DEFAULT_ENABLED_PRODUCT_MODULE_IDS];
		return filterKnownProductModuleIds(parsed.filter((id): id is string => typeof id === 'string'));
	} catch {
		return [...DEFAULT_ENABLED_PRODUCT_MODULE_IDS];
	}
}

function writeStoredEnabledIds(ids: readonly ProductModuleId[]): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((id, i) => id === b[i]);
}

/** Enabled module ids — hydrated from localStorage, else server defaults. */
let enabledIds = $state<ProductModuleId[]>(readStoredEnabledIds());

/**
 * Apply server preferences (from `GET /v1/me`) onto the in-memory state + localStorage cache.
 * No-op when the arrays are equal so $derived nav does not thrash.
 */
export function applyServerProductModules(ids: readonly string[]): void {
	const next = filterKnownProductModuleIds(ids);
	if (sameIds(enabledIds, next)) return;
	enabledIds = next;
	writeStoredEnabledIds(next);
}

export function isProductModuleEnabled(id: string): boolean {
	return enabledIds.includes(id as ProductModuleId);
}

/**
 * Optimistic toggle + PUT /v1/me/preferences (full replace).
 * Rolls back state + cache on failure. Caller should surface errors via i18n.
 */
export async function setProductModuleEnabled(
	id: string,
	enabled: boolean,
	queryClient?: QueryClient
): Promise<void> {
	if (!PRODUCT_MODULE_IDS.includes(id as ProductModuleId)) return;

	const previous = [...enabledIds];
	const next = enabled
		? previous.includes(id as ProductModuleId)
			? previous
			: [...previous, id as ProductModuleId]
		: previous.filter((x) => x !== id);

	enabledIds = next;
	writeStoredEnabledIds(next);

	try {
		const body = { enabled_product_modules: next };
		const saved = await apiSend<UserUiPreferences>(apiPaths.mePreferences, 'PUT', body);
		const confirmed = filterKnownProductModuleIds(saved.enabled_product_modules);
		enabledIds = confirmed;
		writeStoredEnabledIds(confirmed);
		await queryClient?.invalidateQueries({ queryKey: ['me'] });
	} catch (err) {
		enabledIds = previous;
		writeStoredEnabledIds(previous);
		throw err;
	}
}

export async function toggleProductModule(id: string, queryClient?: QueryClient): Promise<void> {
	await setProductModuleEnabled(id, !isProductModuleEnabled(id), queryClient);
}

/** Catalog entry linked to a feature card (`id` === `feature.id`), if any. */
export function productModuleForFeatureId(featureId: string): ProductModule | undefined {
	return PRODUCT_MODULE_CATALOG.find((m) => m.id === featureId);
}

/** Nav items for enabled tools — reactive when read inside `$derived`. */
export function getEnabledProductNavItems(): NavItem[] {
	return PRODUCT_MODULE_CATALOG.filter((m) => enabledIds.includes(m.id)).map((m) => ({
		labelKey: m.labelKey,
		href: m.href,
		icon: m.icon
	}));
}

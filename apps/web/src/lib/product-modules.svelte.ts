/**
 * Toggleable product modules for the Ürünler sidebar group.
 * Persistence + SSR guard mirrors `$lib/theme.ts`; reactivity mirrors `$lib/i18n/locale.svelte`.
 */

import type { Component } from 'svelte';
import type { FeatureModule } from '@verimaya/shared';
import Megaphone from '@lucide/svelte/icons/megaphone';

import type { MessageKey } from '$lib/i18n/messages';
import type { NavItem } from '$lib/navigation';

const STORAGE_KEY = 'verimaya:product-modules';

export type ProductModule = {
	id: string;
	labelKey: MessageKey;
	href: string;
	icon: Component;
	/** Matches `Feature.module` / Araçlar section heading. */
	department: FeatureModule;
};

/** Single catalog of modules that can appear under Ürünler when enabled. */
export const PRODUCT_MODULE_CATALOG: readonly ProductModule[] = [
	{
		id: 'campaign-assistant',
		labelKey: 'nav.campaignAssistant',
		href: '/marketing',
		icon: Megaphone,
		department: 'Pazarlama'
	}
];

function readStoredEnabledIds(): string[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const known = new Set(PRODUCT_MODULE_CATALOG.map((m) => m.id));
		return parsed.filter((id): id is string => typeof id === 'string' && known.has(id));
	} catch {
		return [];
	}
}

function writeStoredEnabledIds(ids: string[]): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

/** Enabled module ids — default empty (all catalog entries off). */
let enabledIds = $state<string[]>(readStoredEnabledIds());

export function isProductModuleEnabled(id: string): boolean {
	return enabledIds.includes(id);
}

export function setProductModuleEnabled(id: string, enabled: boolean): void {
	if (!PRODUCT_MODULE_CATALOG.some((m) => m.id === id)) return;
	const next = enabled
		? enabledIds.includes(id)
			? enabledIds
			: [...enabledIds, id]
		: enabledIds.filter((x) => x !== id);
	enabledIds = next;
	writeStoredEnabledIds(next);
}

export function toggleProductModule(id: string): void {
	setProductModuleEnabled(id, !isProductModuleEnabled(id));
}

/** Catalog entry linked to a feature card (`id` === `feature.id`), if any. */
export function productModuleForFeatureId(featureId: string): ProductModule | undefined {
	return PRODUCT_MODULE_CATALOG.find((m) => m.id === featureId);
}

/** Nav items for enabled product modules — reactive when read inside `$derived`. */
export function getEnabledProductNavItems(): NavItem[] {
	return PRODUCT_MODULE_CATALOG.filter((m) => enabledIds.includes(m.id)).map((m) => ({
		labelKey: m.labelKey,
		href: m.href,
		icon: m.icon
	}));
}

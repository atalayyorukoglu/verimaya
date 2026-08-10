/**
 * Resolved GAP-28 gate for app code (not for Vitest — imports `$env` via `env.ts`).
 * Logic lives only in `isDevPanelEnabled`; this file is the single wiring of
 * `USE_MSW` + `import.meta.env.DEV` for AppShell / `/dev`.
 */
import { isDevPanelEnabled } from '$lib/dev-panel';
import { USE_MSW } from '$lib/env';

export const DEV_PANEL_ENABLED = isDevPanelEnabled(USE_MSW, import.meta.env.DEV);

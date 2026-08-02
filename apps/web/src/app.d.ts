// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

interface ImportMetaEnv {
	readonly PUBLIC_API_URL: string;
	readonly PUBLIC_SITE_URL: string;
	readonly PUBLIC_APP_URL: string;
	readonly PUBLIC_CRM_URL: string;
	readonly PUBLIC_USE_MSW: string;
	/** Override karne telemetry: "true" | "false". Unset → off in dev, on in prod. */
	readonly PUBLIC_KARNE_TELEMETRY?: string;
	/** Enable karne lead capture only when explicitly set to "true". */
	readonly PUBLIC_KARNE_LEADS_ENABLED?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

export {};

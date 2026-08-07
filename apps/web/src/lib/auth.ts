import { browser } from '$app/environment';
import { createAuthClient } from 'better-auth/client';
import { organizationClient, twoFactorClient } from 'better-auth/client/plugins';
import { PUBLIC_API_URL } from '$lib/env';

/** Empty PUBLIC_API_URL → same-origin (Vite /v1 proxy in local host-split). */
const authBaseURL = PUBLIC_API_URL || (browser ? window.location.origin : 'http://localhost:5173');

export const authClient = createAuthClient({
	baseURL: authBaseURL,
	basePath: '/v1/auth',
	fetchOptions: {
		credentials: 'include'
	},
	plugins: [organizationClient(), twoFactorClient()]
});

export type AuthSession = typeof authClient.$Infer.Session;

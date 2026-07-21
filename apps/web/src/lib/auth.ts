import { createAuthClient } from 'better-auth/client';
import { organizationClient, twoFactorClient } from 'better-auth/client/plugins';
import { PUBLIC_API_URL } from '$lib/env';

export const authClient = createAuthClient({
	baseURL: PUBLIC_API_URL,
	basePath: '/v1/auth',
	fetchOptions: {
		credentials: 'include'
	},
	plugins: [organizationClient(), twoFactorClient()]
});

export type AuthSession = typeof authClient.$Infer.Session;

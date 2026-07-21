import {
	CanActivate,
	ExecutionContext,
	Injectable,
	UnauthorizedException
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import { getAuth } from './auth';

export type AuthSession = NonNullable<
	Awaited<ReturnType<ReturnType<typeof getAuth>['api']['getSession']>>
>;

declare module 'fastify' {
	interface FastifyRequest {
		authSession?: AuthSession;
	}
}

@Injectable()
export class SessionGuard implements CanActivate {
	async canActivate(context: ExecutionContext): Promise<boolean> {
		const req = context.switchToHttp().getRequest<FastifyRequest>();
		const session = await getAuth().api.getSession({
			headers: fromNodeHeaders(req.headers)
		});
		if (!session) {
			throw new UnauthorizedException({
				error: { code: 'unauthorized', message: 'Authentication required' },
				request_id: req.id
			});
		}
		req.authSession = session;
		return true;
	}
}

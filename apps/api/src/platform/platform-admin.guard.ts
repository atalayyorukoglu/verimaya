import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { isPlatformAdminEmail } from "./platform-admin";

/**
 * Session must already be set (compose after SessionGuard).
 * Platform admin = email in `PLATFORM_ADMIN_EMAILS` (comma-separated, case-insensitive).
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const email = req.authSession?.user?.email;
    if (!isPlatformAdminEmail(email, process.env.PLATFORM_ADMIN_EMAILS)) {
      throw new ForbiddenException({
        error: {
          code: "platform_admin_required",
          message: "Platform admin access is required",
        },
        request_id: req.id,
      });
    }
    return true;
  }
}

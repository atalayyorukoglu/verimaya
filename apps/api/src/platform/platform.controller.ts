import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  platformMemberUpsertSchema,
  platformTenantCreateSchema,
  platformTenantUpdateSchema,
  reportPeriodParams,
} from "@verimaya/shared";
import type { FastifyRequest } from "fastify";
import { SessionGuard } from "../auth/session.guard";
import { getActorFromRequest } from "../common/active-org.guard";
import { Idempotent } from "../common/idempotent.decorator";
import { parseBody } from "../common/mappers";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformService } from "./platform.service";

@Controller("platform")
@UseGuards(SessionGuard, PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get("tenants")
  listTenants() {
    return this.platformService.listTenants();
  }

  /**
   * Tenant başına LLM maliyeti (Mistral `mistral-medium-latest`, `jobs.job_type='llm.parse'`).
   * `from`/`to` yoksa son 30 gün. RLS'i bilerek aşan tek uç — bkz. platform.service.ts.
   */
  @Get("llm-usage")
  llmUsage(@Query("from") from?: string, @Query("to") to?: string) {
    const params = reportPeriodParams.parse({ from, to });
    return this.platformService.llmUsage(params);
  }

  @Post("tenants")
  @Idempotent()
  createTenant(@Req() req: FastifyRequest, @Body() body: unknown) {
    const input = parseBody(platformTenantCreateSchema, body, req);
    const session = req.authSession!;
    return this.platformService.createTenant(
      input,
      session.user.id,
      getActorFromRequest(req),
    );
  }

  @Patch("tenants/:id")
  @Idempotent()
  updateTenant(
    @Req() req: FastifyRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(platformTenantUpdateSchema, body, req);
    return this.platformService.updateTenant(
      id,
      input,
      getActorFromRequest(req),
    );
  }

  @Delete("tenants/:id")
  @Idempotent()
  softDeleteTenant(
    @Req() req: FastifyRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.platformService.softDeleteTenant(id, getActorFromRequest(req));
  }

  @Get("tenants/:id/members")
  listMembers(@Param("id", ParseUUIDPipe) id: string) {
    return this.platformService.listMembers(id);
  }

  @Post("tenants/:id/members")
  @Idempotent()
  upsertMember(
    @Req() req: FastifyRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(platformMemberUpsertSchema, body, req);
    return this.platformService.upsertMember(
      id,
      input,
      getActorFromRequest(req),
    );
  }

  @Delete("tenants/:id/members/:userId")
  @HttpCode(200)
  @Idempotent()
  removeMember(
    @Req() req: FastifyRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    const session = req.authSession!;
    return this.platformService.removeMember(
      id,
      userId,
      session.user.id,
      getActorFromRequest(req),
    );
  }
}

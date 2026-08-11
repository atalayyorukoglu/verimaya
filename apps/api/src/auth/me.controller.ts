import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  ActiveOrgGuard,
  getActiveOrgId,
  getActorFromRequest,
} from "../common/active-org.guard";
import { IdempotencyExempt } from "../common/idempotent.decorator";
import { DataSubjectService } from "./data-subject.service";
import { MeService } from "./me.service";
import { SessionGuard } from "./session.guard";

@Controller("me")
export class MeController {
  constructor(
    private readonly meService: MeService,
    private readonly dataSubjectService: DataSubjectService,
  ) {}

  @Get()
  @UseGuards(SessionGuard)
  me(@Req() req: FastifyRequest) {
    const session = req.authSession!;
    return this.meService.resolveMembershipUser({
      userId: session.user.id,
      activeOrganizationId: session.session.activeOrganizationId,
      requestId: String(req.id),
      email: session.user.email,
    });
  }

  /**
   * AUDIT-F09-07 / KVKK m.11 — machine-readable export of the **session user's**
   * org-scoped personal data. Subject is never taken from the client body.
   */
  @Get("data-export")
  @UseGuards(SessionGuard, ActiveOrgGuard)
  dataExport(@Req() req: FastifyRequest) {
    const session = req.authSession!;
    return this.dataSubjectService.exportData(
      getActiveOrgId(req),
      session.user.id,
    );
  }

  /**
   * AUDIT-F09-07 / KVKK m.11 — deletion **request** + anonymization (no hard-delete).
   * Self-only: session user is the sole subject.
   */
  @Post("data-deletion-request")
  @UseGuards(SessionGuard, ActiveOrgGuard)
  @IdempotencyExempt(
    "Repeat POSTs converge: an already-applied anonymization request is returned; user/member rows are never hard-deleted.",
  )
  dataDeletionRequest(@Req() req: FastifyRequest) {
    const session = req.authSession!;
    return this.dataSubjectService.requestDeletion(
      getActiveOrgId(req),
      session.user.id,
      getActorFromRequest(req),
    );
  }
}

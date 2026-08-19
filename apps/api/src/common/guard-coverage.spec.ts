/**
 * AUDIT-F09-04 / AUDIT-F09-18: every controller route must either carry the org-auth
 * guard triad (class or method level) or sit on an explicit allowlist with a reason.
 * Same reflection walk as idempotency-coverage.spec.ts — Nest METHOD_METADATA /
 * PATH_METADATA / GUARDS_METADATA, no app bootstrap.
 *
 * Auth entry may be AuthOrApiKeyGuard *or* SessionGuard (both are used in-repo);
 * ActiveOrgGuard + OrgPermissionGuard must follow. A new controller without the triad
 * and without an allowlist entry fails this test.
 */
import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import {
  AdsController,
  AdsOAuthCallbackController,
} from "../integrations/ads/ads.controller";
import {
  GhlController,
  GhlOAuthCallbackController,
} from "../integrations/ghl/ghl.controller";
import { ActiveOrgGuard } from "./active-org.guard";
import {
  discoverAllControllers,
  effectiveGuards,
  guardNames,
  hasOrgAuthTriad,
} from "./all-controllers";
import { AuthOrApiKeyGuard } from "./auth-or-api-key.guard";
import { OrgPermissionGuard } from "./org-permission.guard";

const ALL_CONTROLLERS = await discoverAllControllers();

type RouteRef = {
  controller: string;
  handler: string;
  httpMethod: string;
  path: string;
  key: string;
};

/**
 * Public / non-org-scoped routes. Each entry needs a short why — dropping one without
 * moving it under the triad must fail the coverage assertion.
 */
const PUBLIC_ROUTE_ALLOWLIST: Record<string, string> = {
  "HealthController.check": "Liveness probe — no auth (AUTH-01C7)",
  "HealthController.ready": "Readiness probe — no auth (AUTH-01C7)",
  "KarneController.createSession":
    "Public marketing karne funnel — unauthenticated writes to karne_* only",
  "KarneController.createEvent": "Public karne analytics event",
  "KarneController.complete": "Public karne completion",
  "KarneController.createLead":
    "Public karne lead capture (LEG-02 gated by env)",
  "WebhooksController.ingest":
    "Inbound webhook — signature/API-key verified in-handler, queue-first",
  "WebhooksController.ingestWaha":
    "WAHA inbound webhook — same queue-first public surface",
  "MeController.me":
    "Session-only own profile; not an org-scoped resource (no OrgPermissionGuard)",
  "MeController.listOrganizations":
    "Session-only membership list (soft-deleted tenants excluded); needed before ActiveOrg exists",
  "MeController.putPreferences":
    "Personal UI prefs for session user + active org; Session+ActiveOrg; not an org-admin settings resource (no OrgPermissionGuard)",
  "MeController.dataExport":
    "AUDIT-F09-07 KVKK m.11 self-export; Session+ActiveOrg; subject = session user only (no OrgPermission resource)",
  "MeController.dataDeletionRequest":
    "AUDIT-F09-07 KVKK m.11 self deletion-request; Session+ActiveOrg; subject = session user only (no OrgPermission resource)",
  "PlatformController.listTenants":
    "Platform admin — Session+PlatformAdminGuard; cross-tenant org list (no ActiveOrg)",
  "PlatformController.createTenant":
    "Platform admin — Session+PlatformAdminGuard; create org across tenants",
  "PlatformController.updateTenant":
    "Platform admin — Session+PlatformAdminGuard; rename any org",
  "PlatformController.softDeleteTenant":
    "Platform admin — Session+PlatformAdminGuard; soft-delete any org",
  "PlatformController.listMembers":
    "Platform admin — Session+PlatformAdminGuard; list members of any org",
  "PlatformController.upsertMember":
    "Platform admin — Session+PlatformAdminGuard; upsert member on any org",
	"PlatformController.removeMember":
		"Platform admin — Session+PlatformAdminGuard; remove member from any org",
	"CspReportsController.ingest":
		"Browser CSP Report-Only ingest — unauthenticated by design; size+rate limited",
	"CspReportsController.list":
		"Platform admin — Session+PlatformAdminGuard; CSP violation aggregates (no tenant)",
	"CspReportsController.clear":
		"Platform admin — Session+PlatformAdminGuard; clear CSP violation aggregates",
	"AdsOAuthCallbackController.callback":
    "Ads OAuth provider browser redirect; tenant recovered from signed state",
  "GhlOAuthCallbackController.callback":
    "GHL OAuth provider browser redirect; tenant recovered from signed state",
};

function findAllRoutes(controllers: Function[]): RouteRef[] {
  const out: RouteRef[] = [];
  for (const controller of controllers) {
    const proto = controller.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === "constructor") continue;
      const handler = proto[name];
      if (typeof handler !== "function") continue;

      const httpMethod: RequestMethod | undefined = Reflect.getMetadata(
        METHOD_METADATA,
        handler,
      );
      if (httpMethod === undefined) continue;

      const path =
        (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ??
        "";
      out.push({
        controller: controller.name,
        handler: name,
        httpMethod: RequestMethod[httpMethod] ?? String(httpMethod),
        path,
        key: `${controller.name}.${name}`,
      });
    }
  }
  return out;
}

describe("AUDIT-F09-04: every route has the org-auth guard triad or an allowlisted reason", () => {
  const routes = findAllRoutes(ALL_CONTROLLERS);

  it("discovery finds a non-vacuous set of controllers (guards against broken glob/fs scan)", () => {
    expect(ALL_CONTROLLERS.length).toBeGreaterThanOrEqual(15);
  });

  it("the reflection walk actually finds handlers (guards against vacuous pass)", () => {
    expect(routes.length).toBeGreaterThan(80);
  });

  it("allowlist entries reference real handlers and every entry has a non-empty reason", () => {
    const routeKeys = new Set(routes.map((r) => r.key));
    for (const [key, reason] of Object.entries(PUBLIC_ROUTE_ALLOWLIST)) {
      expect(
        routeKeys.has(key),
        `allowlist key missing from scan: ${key}`,
      ).toBe(true);
      expect(reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("every non-allowlisted route carries AuthOrApiKey|Session + ActiveOrg + OrgPermission", () => {
    const missing: string[] = [];
    for (const route of routes) {
      if (PUBLIC_ROUTE_ALLOWLIST[route.key]) continue;
      const controller = ALL_CONTROLLERS.find(
        (c) => c.name === route.controller,
      )!;
      const handler = (controller.prototype as Record<string, Function>)[
        route.handler
      ];
      const guards = effectiveGuards(controller, handler);
      if (!hasOrgAuthTriad(guards)) {
        missing.push(
          `${route.key} (${route.httpMethod} ${route.path}) guards=[${guardNames(guards).join(",")}]`,
        );
      }
    }
    expect(missing).toEqual([]);
  });

  it("allowlisted routes do NOT carry the org-auth triad (must stay public)", () => {
    const accidental: string[] = [];
    for (const route of routes) {
      if (!PUBLIC_ROUTE_ALLOWLIST[route.key]) continue;
      const controller = ALL_CONTROLLERS.find(
        (c) => c.name === route.controller,
      )!;
      const handler = (controller.prototype as Record<string, Function>)[
        route.handler
      ];
      const guards = effectiveGuards(controller, handler);
      if (hasOrgAuthTriad(guards)) {
        accidental.push(route.key);
      }
    }
    expect(accidental).toEqual([]);
  });

  it("no stale allowlist keys (every allowlisted handler still exists)", () => {
    const routeKeys = new Set(routes.map((r) => r.key));
    const stale = Object.keys(PUBLIC_ROUTE_ALLOWLIST).filter(
      (k) => !routeKeys.has(k),
    );
    expect(stale).toEqual([]);
  });
});

describe("AUDIT-F09-18: class-level guard is the dominant / required pattern for org controllers", () => {
  it("AdsController and GhlController declare the triad at class level (not per-method)", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdsController)).toEqual([
      AuthOrApiKeyGuard,
      ActiveOrgGuard,
      OrgPermissionGuard,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, GhlController)).toEqual([
      AuthOrApiKeyGuard,
      ActiveOrgGuard,
      OrgPermissionGuard,
    ]);

    for (const method of ["status", "authorize", "disconnect"] as const) {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, AdsController.prototype[method]),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(GUARDS_METADATA, GhlController.prototype[method]),
      ).toBeUndefined();
    }
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AdsController.prototype.updateGoogleCustomerId,
      ),
    ).toBeUndefined();
  });

  it("OAuth callback controllers remain unguarded at class and method level", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdsOAuthCallbackController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AdsOAuthCallbackController.prototype.callback,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(GUARDS_METADATA, GhlOAuthCallbackController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        GhlOAuthCallbackController.prototype.callback,
      ),
    ).toBeUndefined();
  });
});

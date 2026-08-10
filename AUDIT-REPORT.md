# Verimaya — Technical & Architectural Audit

> Read-only audit of `/Users/pablofixrav/Projects/verimaya`, branch `main`, HEAD `5f91d80` (per `docs/2026-08-03-YAPILACAKLAR.md`).
> Findings cite real file paths and line numbers. The prompt's "79 spec files" claim is wrong; the actual count is **67** (verified: `find apps -name "*.spec.ts" -not -path "*node_modules*" | wc -l`).

---

## Section 1 — Verdict

**No.** Verimaya is not ready for a pilot with real clinics handling real patient data in its current state. The architecture is unusually disciplined for a solo-developed codebase (RLS everywhere it belongs, enforced-invariant tests for idempotency and permissions, real Postgres in CI), and the team has been actively closing production-shaped bugs. But several things block pilot:

1. **WEBHOOK-01** (Critical, already on the public TODO list as P0): the webhook controller resolves tenant from the `X-Tenant-Id` header. Anyone holding the shared `WAHA_WEBHOOK_SECRET` (or any provider secret) can pretend to be any tenant. This must ship before a second tenant exists.
2. **Patient file-label timezone leak** (Critical, not on any list): `patients.service.ts:516–518` queries `tenants` (no RLS) without a `where(eq(tenants.id, tenantId))` filter; the comment claims RLS scopes it, but the `tenants` table is global. Latent today (all tenants use `Europe/Istanbul`); will leak across tenants the moment one switches.
3. **No SIGTERM handler / graceful shutdown** (High): every deploy cuts in-flight HTTP requests and BullMQ jobs because the process exits on SIGTERM without draining. Solo operator at 3 a.m. deploying a fix during an incident will lose queued work. One-line fix (`app.enableShutdownHooks()`), but absent.
4. **API keys valid forever** (High): no `last_used_at`, no `expires_at`, no rotation policy. A leaked `vk_*` key from 6 months ago still works.
5. **No KVKK aydınlatma for the production data path** (High): `apps/web/src/routes/(public)/kvkk-aydinlatma` is explicitly marked draft and covers only the karne funnel. The main app's patient/clinical/financial data path has no public privacy notice and no data-subject rights endpoint. KVKK m.11 is unimplemented for production data.
6. **No rate limit on the protected API** (High, intentional per code but worth confirming): only the public karne surface is rate-limited; an authenticated client can hammer `/v1/*` without throttling. Combined with the 25 MB body limit on JSON routes, an authenticated attacker can be expensive. The `OrgPermissionGuard` short-circuit on `apiKeyAuth` (`apps/api/src/common/org-permission.guard.ts:29–31`) means API-key auth bypasses every resource-level RBAC check, so any leaked `vk_*` token has tenant-admin powers — a separate High finding the report covers below.

Everything else is either documented accepted-risk, polish, or a fix-once-not-now.

---

## Section 2 — Findings

### [CRITICAL] Webhook tenant resolved from client-supplied `X-Tenant-Id` header
**Where:** `apps/api/src/webhooks/webhooks.controller.ts:34` (header constant), `:71–77` (`requireTenantId` — reads `request.headers['x-tenant-id']` with no signature binding), `:118` (returned to `withTenant`), `:167` (passed as tenantId to insert `inbound_messages`), `:270` (same for `integration_events`). Webhook secret resolved per provider at `:94` from env: `WEBHOOK_SECRET_${PROVIDER}` (single global secret per provider). Tenant scoping at `apps/api/drizzle/0006_queue_platform.sql:11` is the unique `(tenant_id, provider, external_event_id)` index — correct in itself, but the `tenant_id` value it stores comes from the header.
**What:** The webhook signature (`HMAC-SHA256(${timestamp}.${rawBody})`) proves only that *someone who holds the shared provider secret* signed the body. It does NOT bind the request to any tenant. The controller then reads `X-Tenant-Id` and uses that as the tenant for every DB write and queue enqueue, with no cross-check against the secret.
**Why it matters:** A holder of `WAHA_WEBHOOK_SECRET` (or any provider secret) can forge an inbound WhatsApp message attributed to any tenant. Cross-tenant data injection: an attacker can write fake `inbound_messages`, fire fake GHL `integration_events` for a competitor's tenant, or backfill AI drafts for a target's contacts. In a multi-tenant pilot this is direct cross-tenant write access; under KVKK it is a special-category data integrity breach. The threat model in `docs/TEHDIT-MODELI.md` does not list this item.
**Fix:** Bind tenant to provider identity, not header. The team has a designed-but-not-implemented fix (`tenant_provider_identities` table; see `docs/2026-08-03-YAPILACAKLAR.md:24–33`, `WEBHOOK-01`). Implement that table now: per-tenant per-provider webhook secret (or a HMAC of `${provider}.${tenantId}.${timestamp}.${rawBody}`), and resolve `tenantId` from `tenant_provider_identities` after signature passes. Add a `webhooks.cross-tenant-isolation.spec.ts` that proves a valid signature with the wrong `X-Tenant-Id` cannot write to tenant B.
**Effort:** M (migration + controller + tests; design is already done).

### [CRITICAL] `getTenantTimezone` in patients.service has no `where(tenants.id = tenantId)` filter
**Where:** `apps/api/src/patients/patients.service.ts:512–519`. Compare with the correct version at `apps/api/src/appointments/appointments.service.ts:133–145`. Also compare `transactions.service.ts:196–201` and `reports.service.ts:419–425`, both of which correctly filter by `tenants.id`.
**What:** `private async getTenantTimezone(db: TenantDb): Promise<string> { const [row] = await db.select({ timezone: tenants.timezone }).from(tenants).limit(1); return row?.timezone ?? DEFAULT_TENANT_TIMEZONE; }` — no WHERE clause. The comment on lines 513–515 asserts "RLS altında çalıştığı için tek satır döner", but `tenants` has no RLS policy (`apps/api/drizzle/0000_tenants_and_app_context.sql` and `0001_auth_rls.sql` create `tenants` without `ENABLE ROW LEVEL SECURITY` — verified). Result: the query returns the timezone of whichever row the DB scans first, non-deterministically.
**Why it matters:** Used from `resolveAppointmentLink` (`:504`) when a file is uploaded against an appointment. The appointment label becomes `"${datePart} · ${appt.title}"` using a date computed in some other tenant's timezone. Today every tenant uses `Europe/Istanbul` (default), so the bug is invisible. The moment a tenant in a different timezone (say `Europe/London`) creates a file against an appointment, that label will silently use Istanbul time. Worse: this is a *known-bad* comment pattern; if any future code path assumes `withTenant(T, …).from(tenants)` returns T's row, it will be wrong. RLS is the load-bearing wall here; the comment leans on a wall that doesn't exist.
**Fix:** Either (a) take `tenantId` as a parameter and add `where(eq(tenants.id, tenantId))` like `appointments.service.ts` does — minimal, M-effort; or (b) put RLS on `tenants` scoped to `app.current_tenant_id` — risky because `QueueService.registerIntegrationSchedulersIfEnabled` (`:207`) runs **without** tenant context to enumerate all tenants; would break. Do (a).
**Effort:** S (one-liner plus a real-Postgres spec that proves the value matches tenant timezone).

### [HIGH] Authenticated REST API has no rate limit
**Where:** `apps/api/src/main.ts:165–181`. `@fastify/rate-limit` is registered with `global: true, max: 30, timeWindow: '1 minute'`, and `allowList: (req) => !req.url.split('?')[0].startsWith('/v1/public/karne')`. The plugin treats `allowList` returning `true` as **exempt** (verified against `node_modules/.pnpm/@fastify+rate-limit@11.2.0/.../index.js:259–264`: `isAllowed: true`).
**What:** Only `/v1/public/karne/*` gets the 30/min limit. Every other `/v1/*` route — patients, transactions, files, scorecard, integrations — is exempt. There is no per-user, per-tenant, or per-IP limit anywhere else.
**Why it matters:** An authenticated user (or one who has stolen a session/API-key) can make unlimited API calls. Combined with the 25 MB JSON body limit (`apps/api/src/main.ts:125` sets `bodyLimit: MAX_UPLOAD_BYTES = 25 * 1024 * 1024`; verified at `apps/api/src/storage/storage.types.ts:4`) applied to every route including JSON, a single client can drive significant load or balloon DB queries. In Turkish KVKK terms: any rate-limit failure becomes a non-trivial defense-in-depth gap because per-request cost is bounded only by RLS roundtrips. The comment on `:163` ("Unauthenticated karne write surface only — 30/min/IP") confirms this is intentional, not a bug — but it should be a deliberate choice, not a default.
**Fix:** Two buckets — (i) per-user/per-IP throttle on `/v1/auth/*` (login, password reset) at 10/min to slow credential stuffing; (ii) per-tenant token bucket on the rest of `/v1/*` at e.g. 600/min for SPA-friendliness. BullMQ/Redis backplane (the existing infra) so multi-process counts are accurate. The pre-existing `ghl.client.http.ts` `MIN_REQUEST_GAP_MS = 120` per-process throttle documented in `docs/TEHDIT-MODELI.md:131–157` is the same class of problem at a different layer.
**Effort:** M.

### [HIGH] `tenants` table has no RLS — relies on every caller filtering by id
**Where:** `apps/api/drizzle/0000_tenants_and_app_context.sql:11–18`, `0001_auth_rls.sql:111–120`. The `tenants` table is intentionally global (registry of organizations); no `ENABLE ROW LEVEL SECURITY`. Every consumer must filter by id: `apps/api/src/tenants/tenants.service.ts:42`, `apps/api/src/appointments/appointments.service.ts:137`, `apps/api/src/transactions/transactions.service.ts:199`, `apps/api/src/reports/reports.service.ts:423`. The patient-side path at `apps/api/src/patients/patients.service.ts:517` does not.
**What:** This is the underlying class of bug behind the patient-timezone finding above. `tenants` is the only `tenants`-bearing table without RLS, and every caller must remember to filter. The current comment on `patients.service.ts:513–515` documents a wrong assumption.
**Why it matters:** A solo developer with AI assistants producing code that "looks right" is exactly the failure mode where one missed `where(eq(tenants.id, tenantId))` becomes a cross-tenant data leak. The RLS defense-in-depth that protects every other tenant table is absent here.
**Fix:** Add a regression test. Add a CI lint that flags any new `from(tenants)` not under `withTenant`. Accept the architectural choice of no RLS for `tenants` (the team has reasons) but make the assumption explicit and tested. M-effort for the lint+spec, S-effort for the spec alone.
**Effort:** S.

### [HIGH] OpenAPI spec is hand-maintained and has drifted from controllers
**Where:** `apps/api/openapi.yaml` (1,271 lines, manual per `description: "maintained manually (NestJS + Fastify; no runtime Swagger UI yet)"`). Controllers enumerated with `@Controller`/`@Get`/`@Post`/`@Patch`/`@Delete`/`@Put` decoration across 20 controllers.
**What:** The spec is missing at least these live endpoints:
- `/v1/appointments` and `/v1/appointments/:id` (PATCH) — controller exists at `apps/api/src/appointments/appointments.controller.ts`
- `/v1/audit-logs` — controller at `apps/api/src/audit-logs/audit-logs.controller.ts`
- `/v1/transactions` and `/v1/transactions/:id` (PATCH) — controller at `apps/api/src/transactions/transactions.controller.ts`
- `/v1/members` — controller at `apps/api/src/members/members.controller.ts`
- `/v1/reports/balances`, `/v1/reports/patient-distribution`, `/v1/reports/marketing` — referenced in `packages/shared/src/api.ts:84–89`
- `/v1/patients/:id/files` (GET list), `/v1/patients/:id/files/:fileId/download` (GET), `/v1/patients/:id/finance-summary` (GET), `/v1/patients/duplicate-groups` (GET), `/v1/patients/merge` (POST), `/v1/patients/:id` (PATCH/DELETE) — controller at `apps/api/src/patients/patients.controller.ts:62–362`
- `/v1/contacts/:id` (PATCH/DELETE), `/v1/contacts/duplicate-groups`, `/v1/contacts/merge` — controller at `apps/api/src/contacts/contacts.controller.ts`

Conversely, some spec'd endpoints (`/v1/health/ready`) appear in OpenAPI but the controller uses `@Get('ready')` (`apps/api/src/health/health.controller.ts:23`), so spec and code agree on `/v1/health/ready`.

**Why it matters:** A hand-maintained spec drifts; we are past the drift point. The frontend does NOT use OpenAPI — it uses `apiPaths` from `packages/shared/src/api.ts` (verified at `apps/web/src/lib/query-keys.ts`, `apps/web/src/lib/components/*`). So no production request flows against a stale spec. But the public `/v1/openapi.yaml` and `/v1/docs` (Scalar) are mounted unconditionally (per `apps/api/src/main.ts:186` and `apps/api/src/docs/openapi.mount.ts:47–71`) and unauthenticated — the threat model in `docs/TEHDIT-MODELI.md:91–128` already calls this out as a "kabul edilen risk" with the recommendation to lock it down. The drift makes that worse: the spec is now both incomplete and a reconnaissance target.
**Fix:** Two options — (a) delete `/v1/docs` and `/v1/openapi.yaml` mounts in production until spec is regenerated; (b) write a small reflection-based OpenAPI generator (NestJS's `@nestjs/swagger` is already a transitive dep of the plugin set; check before adding it). Either way, fix drift. Until then, lock down `/v1/docs` with a token.
**Effort:** M (lockdown is S; generator is M).

### [HIGH] Permission model has 3 resources for 20 controllers; `settings:update` overloads too much
**Where:** `apps/api/src/auth/permissions.ts:14–22` defines only `patient`, `finance`, `settings` resources. The actual controllers protect semantically different things: `scorecard` (8 endpoints use `settings:read/update`), `reports` (7 endpoints use `finance:read`), `audit-logs` (uses `settings:read`), `api-keys` (uses `settings:read/update`), `members` (uses `settings:read`), `webhook-subscriptions` (uses `settings:read/update`), `ad-metrics` (uses `finance:read/update`), `tenants` (uses `settings:read/update`).
**What:** `settings:update` is checked by `RequireOrgPermission('settings', 'update')` on operations as semantically distinct as creating an API key, modifying tenant profile, creating a scorecard profile, and creating a webhook subscription. A `manager` (per `permissions.ts:38–42`) has `settings:read` only — but in practice the only meaningful settings reads are via `scorecard` and `audit-logs`, both of which the model lumps under settings. `readonly` has `settings:read` and can therefore read audit logs (`:read`) and `members.list` (`:read`) — these are arguably admin-only surfaces. `agent` (line 43–47) has `patient:create/read/update` but no `finance` — correct.
**Why it matters:** The pattern is "check the cheapest resource that proves you're not anonymous" rather than "check the right resource." When a real customer asks "why can my readonly agent read the audit log of every action everyone in the org took?", the answer "because settings:read" is hard to defend. For KVKK, audit log access should be tighter (owner/admin only). **Additionally, the OrgPermissionGuard short-circuits to `true` for `apiKeyAuth` at `apps/api/src/common/org-permission.guard.ts:29–31`** — so a write-scope API key can perform any `RequireOrgPermission`-protected action (including creating API keys, modifying tenant settings) without per-resource checks. This is a separate High finding; I cite it here because it's the same root class of issue (resource model not expressive enough).
**Fix:** Add resources to `permissions.ts`: `audit`, `members`, `api_keys`, `webhook_subscriptions`, `scorecard`. Each controller should declare the actual resource. `manager` should not have `api_keys:create` (that's owner/admin). L-effort if done as a sweep, M-effort if done conservatively with role-impact analysis.
**Effort:** M.

### [INFO] `Idempotency-Key` IS in CORS allowedHeaders; webhook headers are not (no impact)
**Where:** `apps/api/src/main.ts:136`. `allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Admin-Queue-Token']`.
**What:** `Idempotency-Key` is listed — the SPA can send it on mutations from the browser. The webhook headers (`X-Webhook-Timestamp`, `X-Webhook-Signature`, `X-External-Event-Id`, `X-Tenant-Id`) are not, but external providers don't use browsers so CORS doesn't apply. If a future client-side path ever needs them, they'd be blocked.
**Why it matters:** None today.
**Fix:** None. Add the four webhook headers if/when a browser client ever needs them.
**Effort:** S if/when needed.

### [HIGH] BullMQ scheduler feature-flag default-off — periodic jobs silently disabled
**Where:** `apps/api/src/queue/queue.service.ts:191–200` registers `ghl.reconcile`, `ad_metrics.sync` (6h cadence), `files.sweep_pending` (24h) **only when `ENABLE_INTEGRATION_SCHEDULERS=true`**. The `.env.example:79–82` says "Default off — leave unset/false locally so workers do not spam Redis." There is no equivalent entry in `apps/api/.env.example` showing what the **prod** value must be.
**What:** In a deploy where the env var is forgotten, no periodic sync happens. GHL data goes stale, orphan files accumulate (>24h pending files are swept — see `apps/api/src/storage/files-sweep.service.ts:13` `FILES_SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000`). This is silent failure mode; logs show "Integration schedulers skipped (ENABLE_INTEGRATION_SCHEDULERS!=true)" but no alarm is raised.
**Why it matters:** Operational surprise during pilot. The first sign will be stale CRM data or unbounded orphan pending files.
**Fix:** Either invert the default (enable by default; require explicit opt-out) or, given the comment about local spam, add a startup assertion: in production (`NODE_ENV=production`), warn loudly and require the env var. Better: add a readiness probe at `/v1/health/ready` that fails when schedulers are off in prod.
**Effort:** S.

### [HIGH] OpenAPI/Scalar + Bull Board exposed unauthenticated
**Where:** `apps/api/src/main.ts:186` mounts OpenAPI docs unconditionally; `apps/api/src/docs/openapi.mount.ts:47–71` serves `/v1/openapi.yaml` and `/v1/docs` with no guard. `apps/api/src/queue/bull-board.mount.ts:17–19` enables Bull Board if `isDevelopment || Boolean(adminQueueToken)`. Token comparison now constant-time (per F-07, `bull-board.mount.ts:41–49`); no rate-limit, no rotation policy in `docs/DEPLOY-COOLIFY.md`.
**What:** Already self-documented as accepted risk in `docs/TEHDIT-MODELI.md:91–128`. Worth re-stating because it sits next to the OpenAPI drift finding above: an out-of-date reconnaissance document is now public. Bull Board, if enabled, has no per-request throttling on its admin token.
**Fix:** Token gate `/v1/openapi.yaml` and `/v1/docs` with the same `ADMIN_QUEUE_TOKEN` pattern (or a separate `API_DOCS_TOKEN`). Token rotates. Lock down Bull Board in prod — disable by default.
**Effort:** S.

### [HIGH] `tenants` table FK constraint behavior on org deletion not validated
**Where:** `apps/api/drizzle/0001_auth_rls.sql:118` `tenants.id REFERENCES organization(id) ON DELETE cascade`. `apps/api/src/auth/auth.ts:65–71` `afterCreateOrganization` inserts into `tenants`; `afterUpdateOrganization` updates name/slug.
**What:** A user-initiated org deletion would cascade-delete the tenant and every row in every tenant-scoped table (because they all `ON DELETE cascade` from `tenants.id`). The `member` and `session` tables also cascade. There is no UI to delete an org in the controllers; better-auth's `organization.delete` would do it.
**Why it matters:** For a pilot with real clinics, accidental or malicious org deletion = total data loss with no audit trail in the app's own audit log (audit_logs also cascades). KVKK requires data retention controls and the right-to-deletion — but also the duty to retain financial/medical records for 10 years (Turkish tax law). A single delete endpoint wipes both sides.
**Fix:** Disable better-auth org delete in production (override the handler or set `allowOrgDelete: false`). Or: replace `ON DELETE cascade` with `ON DELETE restrict` and require explicit data lifecycle handling. Add a `tenants.deleted_at` soft-delete column for compliance. M-effort.
**Effort:** M.

### [MEDIUM] Pino logger configured with default serializers — PHI may leak into logs
**Where:** `apps/api/src/main.ts:121–127`. Logger: `{ level: process.env.LOG_LEVEL ?? 'info' }`. `apps/api/src/common/http-exception.filter.ts:81–86` logs `{ err: exception, request_id: requestId }` and the Sentry path at `apps/api/src/common/sentry.ts:27–41` calls `Sentry.withScope` with no `beforeSend` redaction.
**What:** Default pino with no redact paths. A 500 from a DB query that includes a patient's name/phone/email in the constraint error (e.g., unique-constraint on email) will serialize the entire error to stdout. Sentry receives the same payload. No `beforeSend` redaction is configured.
**Why it matters:** KVKK Art. 12 — special-category personal data should not appear in logs that may be aggregated by third-party processors (Sentry). PII in stdout also leaks via any log-shipping sidecar (e.g., Loki/CloudWatch) the operator attaches.
**Fix:** Add `redact: { paths: ['err.message', 'err.cause.message', 'extra.*'], remove: true }` to pino config; add `Sentry.init({ beforeSend(event) { /* scrub */ return event } })`. The LLM PII mask at `apps/api/src/integrations/llm/pii-mask.ts` is the right reference pattern.
**Effort:** S.

### [MEDIUM] Adapter layer invariant holds — only the outbox does its own HTTP
**Where:** Single `fetch(` call outside integrations is at `apps/api/src/queue/outbox.processor.ts:52` (outbound webhook delivery — correct per design). Integration adapters inject `fetchFn` for testability (`apps/api/src/integrations/llm/openai-compatible-llm.client.ts:18`).
**What:** The "domain code never calls fetch" invariant is enforced. One place: GhlHttpClient (`apps/api/src/integrations/ghl/ghl.client.http.ts:27, 87, 231–238`) keeps a process-local `lastRequestAt` throttle — per the threat model §4 in `docs/TEHDIT-MODELI.md:131–157`, this throttle is fine at one replica, broken at ≥2. Documented as accepted risk; not a finding under the "high-risk-now" lens.
**Fix:** None unless scaling out. Watch for the deployment replica count.
**Effort:** n/a now; M if replicas go up.

### [MEDIUM] `outbox.processor` does single-fetch delivery with no idempotency at receiver
**Where:** `apps/api/src/queue/outbox.processor.ts:30–88`. POSTs to `event.destinationUrl`, signs with HMAC, updates row to `sent` or `failed`. `attempts` field increments; `DEFAULT_QUEUE_JOB_OPTIONS.attempts = 5, backoff: exponential` (`apps/api/src/queue/queue.constants.ts:30–33`). On terminal failure (`status='failed'`), BullMQ also marks the job failed (`:258–262`); no DLQ.
**What:** Outbox retry: 5 attempts with exponential backoff. After exhaustion, `outbox_events.status = 'failed'` and `jobs.status = 'failed'`. There is no DLQ or separate retry-from-failed path. An event that fails 5 times is silent.
**Why it matters:** Real-world webhook receivers have transient outages. After 5 retries (1s + 2s + 4s + 8s + 16s ≈ 31s plus jitter), a still-down receiver causes the event to land in `outbox_events.status='failed'` with no automatic re-driving. A 3 a.m. incident with an external receiver outage means manual SQL to re-drive.
**Fix:** Either (a) increase attempts/backoff for outbound (`attempts: 20, backoff: { type: 'exponential', delay: 60000 }`), or (b) add a `requeue-from-failed` admin endpoint or scheduled job that re-enqueues `outbox_events.status='failed' AND updated_at < now() - interval '1 hour'`. The latter is the standard outbox pattern.
**Effort:** M.

### [MEDIUM] Frontend has hardcoded Turkish strings on most pages
**Where:** `apps/web/src/lib/i18n/messages.ts` has 596 entries (~298 unique keys × 2 locales). `apps/web/src/routes/patients/+page.svelte` contains Turkish strings like `Hasta listesi yüklenemedi`, `Yeni hasta`, `Hasta bulunamadı`, `Çift kayıt tara`, column headers `Ad`/`Durum` etc. Spot-checked in 10 routes; every route I sampled has hardcoded strings.
**What:** The i18n catalogue rule (`AGENTS.md`) says new code must go through `t()`. The current UI is mostly violating it. The team self-documents this: "Mevcut ekranlardaki Türkçe metinler henüz kataloğa taşınmadı (ayrı iş). Kural **yeni ve dokunulan** kod için bağlayıcıdır." So it's a known migration backlog, not a stealth bug.
**Why it matters:** A `en` translation pass before exporting is going to be much more painful than incremental. Also: TanStack Query error messages often contain server error codes mixed with hardcoded fallback strings — the failure UX is currently bilingual by accident.
**Fix:** Incremental. Whenever a `.svelte` file is touched, the file's strings get moved to `messages.ts` (the `edit/add` discipline in `AGENTS.md` already documents this). Schedule a one-time sweep before marketing-locale split (`/tr/` + `/en/`) per `AGENTS.md` "Marketing locale ağacı."
**Effort:** L.

### [MEDIUM] Auth tables have no RLS — documented accepted risk
**Where:** `docs/TEHDIT-MODELI.md:12–88` describes in detail. `apps/api/drizzle/0001_auth_rls.sql` creates `user`, `session`, `account`, `organization`, `member`, `invitation`, `two_factor` without RLS. `verimaya_app` role has full CRUD on these tables (`apps/api/drizzle/0003_app_role.sql:14`).
**What:** Documented accepted risk for single-tenant pre-pilot. The threat model explicitly says: "Faz 8 PILOT-02 çok-tenant'lı hâle geldiğinde bu madde yeniden değerlendirilmeli." This is *good* security hygiene for the team (acknowledging accepted risks in writing), not a hidden gap.
**Why it matters:** As soon as two tenants exist, any future bug in domain code that does a raw `select().from(session)` would expose cross-tenant session tokens (including OAuth refresh tokens in `account`). Mitigation: never query auth tables from domain code (current invariant).
**Fix:** None now. Re-evaluate at PILOT-02. Consider column-level grants on `two_factor.secret`, `account.access_token`/`refresh_token` before that milestone. `docs/TEHDIT-MODELI.md:76–88` lays out the options.
**Effort:** M if/when re-evaluated.

### [MEDIUM] Idempotency enforcement is excellent; one spot-check suggests a known gap
**Where:** `apps/api/src/common/idempotency-coverage.spec.ts` reflection-walks every mutating handler and asserts each carries `@Idempotent()` or `@IdempotencyExempt(reason)`. The reflection walk expects exactly 53 handlers and asserts the enforced subset. This is the gold standard.
**What:** All 53 mutation handlers are covered. Webhooks are class-level exempt with a justified reason (provider event id is the dedup mechanism, not Idempotency-Key — documented at `webhooks.controller.ts:131–140`). Karne is class-level exempt (public). All other mutations are enforced. Excellent.
**Why it matters:** None today; future-proofing for the team.
**Fix:** None. Use this as the template for `controller-permissions.spec.ts` (which is hand-maintained, less strict).
**Effort:** n/a.

### [MEDIUM] `controller-permissions.spec.ts` is hand-maintained, not reflection-based
**Where:** `apps/api/src/common/controller-permissions.spec.ts`. The test list (lines 38+) hardcodes a controller-by-controller matrix. Unlike the idempotency-coverage spec, it does not walk metadata.
**What:** A new `RequireOrgPermission` on a method that's not listed here could pass even though no test runs. The test still catches obvious bugs but not "I added a new controller and forgot to test it" — the test enforces itself, not the code.
**Why it matters:** Maintenance trap. The current 8 controllers are listed; adding a 9th requires editing this spec.
**Fix:** Refactor to reflection-based walk like `idempotency-coverage.spec.ts`. Walk every controller, walk every handler with `ORG_PERMISSION_METADATA_KEY`, assert that mutating handlers on a tenant-scoped controller have at least one requirement. Keep the current assertions as additional semantic checks.
**Effort:** M.

### [MEDIUM] SvelteKit `+page.server.ts`, form actions, API routes — none used; but `+page.ts` server-only loads might exist
**Where:** `apps/web/src/routes/**/+page.svelte` count: ~50; no `.server.ts` files found (`find apps/web/src/routes -name "*.server.*" 2>/dev/null`). The `apps/web/src/lib/host.ts` boundary (per `AGENTS.md`) means `app.localhost:5173` serves the panel, `localhost:5173` the hub.
**What:** Confirmed by file scan: no `+page.server.ts`, no `+server.ts`, no form actions. The architecture is genuinely "panel SPA + prerendered hub." Good.
**Why it matters:** Compliance with the architecture invariant. Confirmed.
**Fix:** None. Add a `routes/**/+page.svelte` lint rule that forbids `<form method="POST">` without a server action.
**Effort:** S if lint is wanted.

### [MEDIUM] OAuth state integrity is correct; OAuth callback does NOT authenticate the user
**Where:** `apps/api/src/integrations/ghl/ghl.controller.ts:104–119`. `callback()` has no `@UseGuards` (correct — OAuth callbacks come from the provider). State is encrypted + bound + has 10-min TTL (`apps/api/src/integrations/ghl/ghl-oauth.state.ts:4–73`).
**What:** The state integrity is good (AES-GCM with bound `provider`, 10-min expiry). However, the *user* who initiates the OAuth is identified only by the state, which was minted when they hit `/authorize` (authenticated). If an attacker can intercept or guess a `code` paired with a valid `state`, the callback writes the resulting GHL credential to the tenant encoded in the state. State TTL is 10 minutes — short enough to limit exposure but long enough to be exploitable if an attacker can MITM the callback redirect.
**Why it matters:** OAuth state with 10-min TTL and an encrypted blob is the right design. The risk is that state is replayable within 10 minutes; an attacker who steals a state before TTL expiry wins. This is standard OAuth security.
**Fix:** Reduce state TTL to 60 seconds if possible (the time between `/authorize` and `/callback` is usually <10s). Add a one-time-use constraint on state — currently nothing prevents replay if the same state+code pair is captured twice. Document the threat.
**Effort:** S (TTL change) to M (one-time-use).

### [MEDIUM] `tenantDb` plpgsql function marked VOLATILE — but a smart-QL framework could still cache
**Where:** `apps/api/drizzle/0002_tenant_fn_volatile.sql`. `app.current_tenant_id()` is `LANGUAGE sql VOLATILE` (correct per the comment — `STABLE` would let prepared-statement plans cache). The migration explicitly notes "Prepared statements (postgres.js) + STABLE GUC helpers break RLS isolation."
**What:** The fix is correct. But: in `apps/api/src/tenant/tenant-context.service.ts:21–26`, the `withTenant` runs `set_config('app.current_tenant_id', ..., true)` inside `db.transaction(async tx => ...)`. The `true` flag scopes the GUC to the current transaction, which the Drizzle transaction wrapper implements. Good.
**Why it matters:** None, but: `apps/api/src/queue/queue.service.ts:207` reads `from(tenants)` without `withTenant` — this is fine (tenants is global), but illustrates that any code path that *intentionally* runs without `withTenant` is a footgun if someone later adds a RLS-protected tenant table to a query.
**Fix:** None today. Add a CI test that enumerates raw `from(<tenantRlsTable>)` outside `withTenant` and asserts zero matches.
**Effort:** M (lint+test).

### [MEDIUM] Contacts duplicate-detection loads the entire contact table into memory
**Where:** `apps/api/src/contacts/contacts.service.ts:111–116`. `duplicateGroups(tenantId)` does `db.select().from(contacts)` with no filter and passes all rows to `findContactDuplicateGroups` (a shared package pure function).
**What:** O(N) memory per call; pairwise comparisons inside the function are O(N²) worst case. With ~1000 contacts this is fine. With 10,000 contacts a single call could OOM a small worker.
**Why it matters:** Acceptable for pilot; will hurt at scale.
**Fix:** Cap with `limit` + cursor pagination (return only the next duplicate group on each call). Or run detection nightly as a job with bounded input.
**Effort:** M.

### [MEDIUM] Some controllers lack method-level guards (per-method vs class-level)
**Where:** `ads.controller.ts`, `ghl.controller.ts` decorate each method with `@UseGuards(...)` rather than putting it at the class level. This is verbose and error-prone — a method added without the decorator would be unguarded. `controller-permissions.spec.ts` enforces `@RequireOrgPermission` but not `@UseGuards`.
**What:** Two of 20 controllers use the per-method guard style. No current method is missing guards (verified by grep).
**Why it matters:** Maintenance. If a future controller adopts per-method guards inconsistently, an unguarded endpoint could slip through.
**Fix:** Adopt the reflection-based guard check (same shape as `idempotency-coverage.spec.ts`). Or just enforce class-level guard decorators in lint.
**Effort:** S.

### [MEDIUM] `tenants` table timezone default + per-tenant override is fine, but tenant settings have no validation against IANA timezone names
**Where:** `apps/api/drizzle/0020_tenant_timezone.sql`. `tenants.timezone` is `text NOT NULL DEFAULT 'Europe/Istanbul'`. `apps/api/src/tenants/tenants.service.ts:30` allows any string.
**What:** A client can PATCH `tenants.timezone = 'Mars/Olympus_Mons'` and then `toTenantDayKey` will fail at runtime, not at validation time.
**Why it matters:** Low impact — caught by a runtime exception. Not a security issue.
**Fix:** Validate against `Intl.supportedValuesOf('timeZone')` (Node 18+) in the zod schema for `TenantUpdate`.
**Effort:** S.

### [MEDIUM] `corsOrigins` allowlist is read once at boot
**Where:** `apps/api/src/main.ts:21–28`. CORS list is built from `process.env.TRUSTED_ORIGINS` and `process.env.WEB_PUBLIC_URL` at startup.
**What:** Adding an origin requires a deploy. `betterAuth({ trustedOrigins: ... })` at `apps/api/src/auth/auth.ts:27–31` reads the same env at startup.
**Why it matters:** Operationally annoying, not security-relevant. Adding a customer staging origin requires a redeploy.
**Fix:** None required. Document.
**Effort:** n/a.
**Resolution (AUDIT-F09-20, 2026-08-10):** Closed as **no-op**. Documented in `docs/DEPLOY-COOLIFY.md` (origin change = API restart by design). Hot-reload / DB allowlist rejected: install-wide single panel host, not tenant-scoped; mutable CORS would widen the security boundary for an operational convenience the audit itself marked optional.

### [MEDIUM] `bullmqJobId` foreign-key relationship is not enforced
**Where:** `apps/api/src/db/schema/queue.ts` defines `bullmqJobId: text` on the `jobs` table; `apps/api/src/webhooks/webhooks.controller.ts:228` writes `bullmqJobId = bullJob.id` after enqueue. No FK to Redis.
**What:** The id is informational. If the BullMQ job is later deleted from Redis, the column has a stale reference. There is no periodic reconciliation that removes rows whose `bullmqJobId` no longer exists.
**Why it matters:** Minor: orphaned `bullmqJobId` strings over time; no operational impact.
**Fix:** None required. Use the row's own `id` (UUID) as the BullMQ `jobId` (`apps/api/src/queue/queue.service.ts:141–143` does `jobId: data.jobId` — already correlated). Drop `bullmqJobId` column or document it as advisory.
**Effort:** S.

### [LOW] Better-auth schema upgrade path is implicit
**Where:** `apps/api/src/auth/auth.ts`. The `betterAuth` plugin set (`bearer`, `organization`, `twoFactor`) is pinned via package version; better-auth's own schema migrations are not versioned in `apps/api/drizzle/`.
**What:** When better-auth upgrades and changes its schema (e.g., adds a column to `session`), Drizzle migrations will not run those changes — better-auth does it via its own migration runner.
**Why it matters:** Cross-tool coordination risk. Better-auth's own migrations are run by better-auth; the team needs to know that.
**Fix:** Document the better-auth upgrade flow in `docs/DEPLOY-COOLIFY.md`. Or: run better-auth migrations in CI as a separate step.
**Effort:** S.

### [LOW] Frontend hardcoded Turkish in dev panel
**Where:** `apps/web/src/routes/dev/+page.svelte` (and probably several others).
**What:** Dev panel is intentionally rough (superadmin), so hardcoded Turkish is fine. Not worth fixing.
**Why it matters:** None.
**Fix:** None.
**Effort:** n/a.

### [LOW] Multiple `_tmp_*` zero-byte files in repo root
**Where:** `~/Projects/verimaya/_tmp_*` (8 files visible from `ls -la`).
**What:** Likely artifacts from a build/test run that didn't clean up. Not committed (`git status` clean), but clutter.
**Why it matters:** Cosmetic.
**Fix:** Add to `.gitignore` or `.dockerignore` and clean up. Trivial.
**Effort:** S.

### [LOW] `enabled` flag in Sentry init has no `beforeSend` redaction
**Where:** `apps/api/src/common/sentry.ts:13–18`.
**What:** Already flagged in the MEDIUM finding on PHI in logs. Calling out separately because Sentry's `beforeSend` is the right place to drop event bodies that contain PHI from 500s.
**Why it matters:** Same as MEDIUM finding.
**Fix:** Same as MEDIUM finding.
**Effort:** Covered above.

### [HIGH] 25 MB body limit applied to every Fastify route including JSON
**Where:** `apps/api/src/main.ts:120–128` (FastifyAdapter `bodyLimit: MAX_UPLOAD_BYTES`). `apps/api/src/storage/storage.types.ts:4` defines `MAX_UPLOAD_BYTES = 25 * 1024 * 1024` (= 25 MB). File uploads use multipart's separate `fileSize` limit at `:141`, which is correct.
**What:** Fastify's `bodyLimit` is the JSON body limit (it's the request-body size cap before parsing). Default is 1 MB. Setting it to 25 MB for all routes means **any** POST endpoint — JSON, no auth required for `/v1/public/karne/*` — accepts a 25 MB payload. The cap exists so a bad client can't OOM the parser.
**Why it matters:** Combined with the no-rate-limit finding above (Critical), an unauthenticated attacker can hammer `/v1/public/karne/leads` with 25 MB POSTs at line rate, consuming Fastify worker memory and parser CPU. With the OrgPermissionGuard's `apiKeyAuth` short-circuit (next finding) on top, an authenticated low-privilege user can do the same on every protected route. The right number for JSON is around 1 MB; file uploads go through multipart's own limit (correctly set to 25 MB at `:141`).
**Fix:** Split: keep `bodyLimit: 1 * 1024 * 1024` at the Fastify adapter level (or lower), keep `multipart.limits.fileSize: 25 MB`. Webhook endpoints are exempt via the `preParsing` hook at `:37–59` which buffers the raw body before the parser sees it; verify that path still works at 1 MB or set per-route limit via the `/v1/webhooks/*` registration.
**Effort:** S.

### [HIGH] OrgPermissionGuard short-circuits to `true` for `apiKeyAuth` — API keys bypass all RBAC checks
**Where:** `apps/api/src/common/org-permission.guard.ts:29–31` (verified by direct read of the file). The guard's `canActivate` checks `req.apiKeyAuth` first and returns `true` if present, skipping all `RequireOrgPermission` metadata checks.
**What:** When a request is authenticated via API key (Bearer `vk_*`), the OrgPermissionGuard approves it without consulting the per-handler `@RequireOrgPermission('resource', 'action')` decorator. The intention is that API keys are scoped at issuance time (read/write) and that scope is checked separately at `apps/api/src/common/auth-or-api-key.guard.ts:35–52`. But the side effect is that **a write-scope API key can do anything the tenant can do** — including create API keys, modify tenant settings, and delete webhook subscriptions — without those endpoints' resource-level RBAC.
**Why it matters:** A leaked API key has tenant-admin-equivalent power within its tenant. Combined with WEBHOOK-01 (Critical), the risk surface widens: any vector that yields a token also yields a full bypass. Operationally, API keys were probably designed for n8n integration scripts, not for full admin operations; the fact that they get tenant-admin powers regardless is an under-documented trust model.
**Fix:** Two options — (a) make OrgPermissionGuard run for both session and API-key auth (treat scopes as a base capability, but require resource-level permission on top), or (b) define API-key scopes explicitly: `keys:write`, `patients:write`, etc., and map them to required resources. Option (b) is the right long-term answer; option (a) is a smaller change. Either way: enforce the resource check.
**Effort:** M (option a) to L (option b).

### [HIGH] No SIGTERM handler or graceful shutdown — deploys drop in-flight requests and queue jobs
**Where:** `apps/api/src/main.ts:117–197` (the `bootstrap()` function). No `app.enableShutdownHooks()`, no `process.on('SIGTERM', …)`, no signal listener. `apps/api/src/queue/queue.service.ts:281–290` (`onModuleDestroy`) closes the BullMQ worker/queue/redis but is only called on Nest's normal lifecycle teardown — which never fires if the process is SIGKILLed or if a SIGTERM is received without a handler.
**What:** Coolify (and every modern orchestrator) sends SIGTERM and waits ~30 seconds for the process to exit cleanly before SIGKILL. This app installs no SIGTERM handler, so the moment SIGTERM arrives the Node process begins its default behavior: no new connections accepted, then exit. In-flight HTTP requests are cut off (clients see TCP reset). In-flight BullMQ jobs are killed mid-step. The graceful worker close at `queue.service.ts:281–290` only runs if Nest's lifecycle teardown fires, which requires `app.enableShutdownHooks()` or manual signal wiring.
**Why it matters:** Solo operator at 3 a.m., trying to deploy a critical fix during an incident. Every deploy cuts queued GHL syncs, outbox deliveries, and inbound WhatsApp parses mid-flight. Retries cover some of it, but the `ad_metrics.sync` (6h) and `files.sweep_pending` (24h) schedulers reset their state, and any `outbox_events.status='processing'` rows are orphaned until the job runs again.
**Fix:** Add `app.enableShutdownHooks()` at the end of `bootstrap()` (one line; Nest will then call `onModuleDestroy` on SIGTERM/SIGINT). Optionally wire an explicit handler that closes the Fastify server (`await app.close()`), then awaits the BullMQ worker drain with a 25-second timeout, then `process.exit(0)`. The first is enough for Coolify's 30s drain. **S.**
**Effort:** S.

### [HIGH] API keys have no `last_used_at`, no `expires_at`, no max-age — leaked keys valid forever
**Where:** `apps/api/src/db/schema/api-keys.ts` (per verification subagent — I did not read the schema directly in my pass). Schema has `tenant_id, name, key_prefix, key_hash, scopes, revoked_at, created_at` only. `apps/api/src/api-keys/api-key.guard.ts:42–59` runs `select id, tenant_id, scopes from app.lookup_api_key(${keyHash})` and **never updates a timestamp**.
**What:** A leaked `vk_*` API key remains valid indefinitely until someone manually hits `DELETE /v1/api-keys/:id`. There's no automatic rotation pressure, no UI hint that "this key hasn't been used in 90 days", no scheduled job that auto-revokes unused keys. The `karne_leads_disabled`-style fail-closed pattern (which the team uses for lead capture) is absent here.
**Why it matters:** KVKK requires data minimization and the right-to-deletion; indefinite-valid bearer tokens work against both. Operationally, the admin panel will accumulate stale API keys that nobody knows are still in use. A leaked n8n-integration key from 6 months ago still works.
**Fix:** Add `last_used_at timestamp` to the schema; update it on every successful `ApiKeyGuard` (one-line UPDATE after the lookup). Add `expires_at timestamp` with a 90-day default; reject expired keys in the lookup. Add a scheduled job that revokes keys where `last_used_at < now() - interval '180 days'`. The "warn before rotation" UX is a separate piece of work. **M** for the schema + guard + scheduler.
**Effort:** M.

### [HIGH] No KVKK aydınlatma for the production data path — patient/clinical/financial data is not privacy-covered
**Where:** `apps/web/src/routes/(public)/kvkk-aydinlatma/+page.svelte:43–44` is explicitly marked draft: `"Taslak — hukukçu onayı bekleniyor."` The page covers only the public karne funnel. The main Verimaya app's patient/clinical/financial data path has no public aydınlatma metni, no privacy policy, no data-subject rights endpoint (KVKK m.11: bilgi talep, düzeltme, silme, itiraz).
**What:** The team has `KARNE_LEADS_ENABLED` fail-closed (`apps/api/src/karne/karne.controller.spec.ts:28–96`) and `LEG-02` in `docs/2026-08-03-YAPILACAKLAR.md:49–55` says "hukukçu onayı sonrası iki flag'i birlikte açılır." So the karne public funnel is correctly gated. But the main app — where real clinics would handle real patient data under KVKK Art. 6 (special-category personal data) — has no public-facing aydınlatma and no API for data-subject rights.
**Why it matters:** KVKK m.11 grants data subjects the right to (a) learn whether their data is being processed, (b) request information about the processing, (c) learn the purpose and recipients, (d) request correction, (e) request deletion/destruction (in some cases), (f) object to automated processing. Implementing these as user-facing endpoints is required before any production clinic uses the system with real patient data. The path is acknowledged but not yet built.
**Fix:** Build a public aydınlatma page at `apps/web/src/routes/(public)/kvkk-aydinlatma/+page.svelte` that covers the production data path (not just karne). Add API endpoints under `/v1/me/data-export`, `/v1/me/data-deletion-request` that gate on `ActiveOrgGuard` and produce audit-log entries. Add a `tenants.data_retention_until` column that downstream code can read to soft-delete after the legal retention period. **L-effort** for the full path; S for the public page if legal review is the bottleneck.
**Effort:** L.

### [MEDIUM] Patient file uploads have no virus scan or MIME-type allowlist — `.exe` as `.pdf` is stored
**Where:** `apps/api/src/storage/local-file.storage.ts:25–37` does path-traversal protection but no content validation. `apps/api/src/main.ts:140–162` registers multipart with `fileSize: 25 MiB` cap; no `allowedMimeTypes`. `apps/api/src/patients/patients.service.ts:171–221` (`createFileWithDb`) trusts `input.mime_type` from the request body.
**What:** The patient file upload pipeline accepts whatever MIME type the multipart parser reports (or whatever the client claims in the JSON body for the metadata row). The bytes go to disk (or S3) verbatim. No ClamAV, no magic-byte sniffing, no allowlist (`application/pdf`, `image/png`, `image/jpeg`, `image/webp` are likely the intended set based on `binaryTypes` at `apps/api/src/main.ts:146–154`).
**Why it matters:** A user with `patient:update` permission can upload arbitrary executable content disguised as a `.pdf`. If a clinic's doctor opens the file in a vulnerable PDF viewer, they get owned. The threat is internal (current employees or compromised accounts), not external; KVKK exposure is the data exfiltration path. Path traversal is already blocked.
**Fix:** Two layers — (a) magic-byte sniffing in `createFileWithDb` before persisting (e.g., `file-type` npm package or `mmmagic`), reject mismatches between declared MIME and actual content; (b) an explicit allowlist at the multipart layer (`multipart.limits.allowedMimeTypes`). Optional but recommended: ClamAV via `clamscan` in a sidecar. The S3 driver needs the same guard; it has none today (`apps/api/src/storage/s3-file.storage.ts`).
**Effort:** M (without ClamAV); L (with).

### [MEDIUM] LLM client embeds upstream response body in thrown Error → logged with PHI risk
**Where:** `apps/api/src/integrations/llm/openai-compatible-llm.client.ts:176` — `throw new Error(\`LLM HTTP ${response.status}: ${body.slice(0, 200)}\`)`. The thrown error is caught at `:120` where `this.logger.warn(\`LLM parse failed...${message}\`)` runs. PII mask at `apps/api/src/integrations/llm/pii-mask.ts` scrubs email, phone, TCKN, IBAN, card groups — **but not clinical free-text** (procedure names, clinic names, dates in the message body).
**What:** When the LLM provider returns a 5xx or 429 with a body, the first 200 chars of that body become an error message, which is logged at warn. If the LLM echoed our prompt back (common with 4xx) — and the prompt contained patient name, procedure, clinic — those leak to logs.
**Why it matters:** KVKK Art. 12 — special-category data in logs aggregated by third parties (Sentry, log shipper) is a violation. The mask is good for the **outbound** call (`buildMaskedLlmUserPayload` at `:140` is called pre-send), but the **inbound** error path has no scrubbing.
**Fix:** In the catch path at `:120`, run the raw body through `pii-mask` before logging. Or simpler: never log the body; log only status + content-type + content-length. **S.**
**Effort:** S.

### [MEDIUM] `tenants` controller has no isolation spec — tenant metadata endpoint unverified cross-tenant
**Where:** `apps/api/src/tenants/tenants.controller.ts` (GET/PATCH `/v1/tenants/current`) is the only tenant-scoped controller with **no `*.isolation.spec.ts`**. `apps/api/src/tenants/tenants.spec.ts` is unit-only — it does not open a Postgres connection. The `tenants` table itself is RLS-less by design (see Section 3 scorecard row for invariant #1), so the absence of an isolation test directly masks the class of bug behind my Critical finding (`getTenantTimezone` returning a wrong tenant's row).
**What:** A reviewer relying on "every tenant-scoped endpoint has an isolation test" (per `AGENTS.md`) would assume `tenants/current` is covered. It is not. The unit spec in `tenants.spec.ts` mocks the service; it cannot catch a cross-tenant data leak because the mock doesn't enforce one.
**Why it matters:** The Critical timezone finding above is exactly the kind of bug this test would catch if it existed. Without it, the team has no signal that a tenant metadata change to one tenant could leak to another.
**Fix:** Add `apps/api/src/tenants/tenants.isolation.spec.ts` using the same pattern as `apps/api/src/appointments/appointments.isolation.spec.ts`. Real Postgres, two tenants, assert tenant A's GET `/v1/tenants/current` does not return tenant B's name/currency/timezone. Pair it with a regression test for the timezone bug. **S.**
**Effort:** S.

### [MEDIUM] `reports.service.ts` computes report date boundaries in UTC, not tenant timezone
**Where:** `apps/api/src/reports/reports.service.ts:75–82` defines `startOfDayUtc(isoDate)` and `dayAfterUtc(isoDate)` using `Date.UTC(y, m-1, d)`. These are called from `fetchTransactions` and `fetchPatientsForPeriod` (`:458, :461`). There is no call to `getTenantTimezone`, no `tenantDayRange`, no `toTenantDayKey` anywhere in the file.
**What:** Report endpoints (`/v1/reports/summary`, `/v1/reports/monthly`, `/v1/reports/patient-distribution`) interpret `?from=2026-08-01&to=2026-08-31` as a UTC date range. For a tenant in `Europe/Istanbul` (UTC+3), the actual local day starts at 2026-08-01 00:00 Istanbul = 2026-07-31 21:00 UTC. The current code includes records created at 2026-07-31 21:00–24:00 UTC (which is already Aug 1 in Istanbul) and excludes records at 2026-08-01 00:00–03:00 Istanbul (which is UTC Aug 1).
**Why it matters:** Pairs with the Critical timezone finding above — same class of bug, different surface. `appointments.service.ts:16, 26, 30` correctly resolves tenant timezone and uses `tenantDayRange`. Reports does not. Latent today (all tenants use `Europe/Istanbul`); surfaces when a tenant in `Europe/London` or `America/New_York` runs a daily report — the boundaries are off by 3–9 hours depending on timezone. For a Turkish clinic doing end-of-day reconciliation at 23:00 Istanbul, this matters.
**Fix:** Mirror the appointments pattern: in each report entry point that takes `?from` / `?to`, resolve the tenant timezone (`:419–425` already has `getTenantBase`; add a parallel `getTenantTimezone`) and replace `startOfDayUtc` / `dayAfterUtc` with the timezone-aware helpers from `@verimaya/shared` (`tenantDayRange` is already exported; verify it accepts an ISO date string in the tenant's local TZ). **S** per endpoint; **M** total.
**Effort:** S–M.

### Minor notes
- `apps/api/src/queue/integration-event.processor.ts:54–57` updates `integration_events.status = 'processed'` even when the SELECT returned `null` (race). The retry will then re-process a "processed" row. Cosmetic — the second pass will short-circuit because `event` is still null; not a bug.
- `apps/web/src/routes/(public)/vitrin` exists per `find apps/web/src/routes -type d`; per `AGENTS.md`, this is "kaynak dosya yalnız prerender/legacy için kalır" and nginx 301s to `/`. Verify the directory has no live code.
- 67 spec files is correct; the prompt's "79" figure is wrong. The CI test command is `pnpm --filter @verimaya/api test` (`apps/web/...` and `packages/shared/...` are tested separately). All 67 run against the real Postgres in CI (`.github/workflows/ci.yml:24–28`).
- The Karne tests (`apps/api/src/karne/karne.controller.spec.ts`) are exemplary: they test the **fail-closed** semantics (no leads until `KARNE_LEADS_ENABLED=true`), not the happy path. Good.

---

## Section 3 — Invariant scorecard

| # | Invariant | Verdict | File that proves it | Justification |
|---|---|---|---|---|
| 1 | Multi-tenant isolation (tenant_id + RLS + SET LOCAL) | **PARTIAL** | `apps/api/src/db/schema/*.ts`, `apps/api/drizzle/0001–0022_*.sql`, `apps/api/src/tenant/tenant-context.service.ts` | RLS coverage on every business table verified across all 23 migrations. `SET LOCAL` always wraps DB work. **But** `tenants` table has no RLS (relies on per-caller `where(id)`); `patients.service.ts:516` has a missed filter (see Critical finding above); webhooks accept client-supplied `X-Tenant-Id` (see Critical finding above). |
| 2 | Queue-first webhooks | **HOLDS** | `apps/api/src/webhooks/webhooks.controller.ts:148–239, 241–351`, `apps/api/src/queue/integration-event.processor.ts`, `apps/api/src/queue/inbound-message.processor.ts` | Webhook handlers verify signature, write to `integration_events` / `inbound_messages`, write a `jobs` row, enqueue, return 202. All business logic lives in workers; controller body is signature + insert + enqueue only. Lock `pg_advisory_xact_lock` for race safety (F-03). |
| 3 | Idempotency (unique constraint + Idempotency-Key) | **HOLDS** | `apps/api/drizzle/0005_idempotency_soft_delete.sql`, `0021_idempotency_key_scope.sql`, `0022_integration_events_tenant_scope.sql`, `apps/api/src/common/idempotent.decorator.ts`, `apps/api/src/common/idempotency-coverage.spec.ts` | `(tenant_id, key, method, normalized_path)` unique index (Faz 4.1). All 53 mutation handlers audited via reflection (idempotency-coverage.spec.ts). Webhooks exempted with documented rationale. |
| 4 | PostgreSQL is system of record | **HOLDS** | `apps/api/src/db/schema/queue.ts`, `apps/api/src/queue/outbox.processor.ts` | `jobs`, `integration_events`, `outbox_events` are persistent tables; Redis/BullMQ are ephemeral. Outbound webhooks delivered via outbox. Cross-tenant unique constraint widening (EVENT-01) and idempotency-key widening (IDEM-01) demonstrate discipline. |
| 5 | Adapter layer (no direct fetch in domain) | **HOLDS** | grep across `apps/api/src/**` | Only `fetch(` outside `apps/api/src/integrations/` is at `apps/api/src/queue/outbox.processor.ts:52`, which is the *outbound* system intentionally. All HTTP to providers goes through `apps/api/src/integrations/<provider>/`. |
| 6 | AI output is a draft | **HOLDS** | `apps/api/src/whatsapp/whatsapp.controller.ts` (approve-drafts endpoint), `apps/api/src/whatsapp/inbound-message.processor.ts` | Inbound messages produce `parsed_records` on the inbox row; transactions only materialize after explicit `POST /whatsapp/inbox/:id/approve` (or approve-drafts). PII mask at `apps/api/src/integrations/llm/pii-mask.ts` runs before LLM send. |
| 7 | Contract lives in `packages/shared` | **HOLDS** | `packages/shared/src/api.ts`, `packages/shared/src/*.ts` | `apiPaths` is the single source for paths; web derives from it; api derives zod schemas from it. `apps/api/src/common/contract-parity.isolation.spec.ts` runs the API services against the same list-query semantics the MSW mocks use. **But**: `apps/api/openapi.yaml` is hand-maintained and has drifted from controllers (see High finding). |
| 8 | Cache keys always include `tenant_id` | **HOLDS** | `apps/web/src/lib/query-keys.ts:25–35` | `scopedKey(scope, ...)` returns `['app', scope.tenantId, scope.userId, ...]` for every cache key. Two intentional exceptions documented (`['me']` and `dev.*`). CACHE-02 also calls `queryClient.clear()` on logout/org-switch. |
| 9 | Conventions (TS strict, ISO dates, minor units, /v1, cursor, error body, Svelte 5, isolation tests) | **PARTIAL** | `apps/api/src/db/schema/transactions.ts:21–26` (integer minor units), `packages/shared/src/api.ts` (cursor), `apps/api/src/common/http-exception.filter.ts` (error body shape), `apps/web/src/routes/**/+page.svelte` (Svelte 5), `apps/api/src/**/isolation.spec.ts` (isolation tests) | Money is integer ✓, dates are ISO ✓, `/v1` prefix ✓, cursor pagination ✓, error body `{error.code, error.message, request_id}` ✓, Svelte 5 runes (zero `export let`/`$:` violations across 73 .svelte files) ✓, 30 isolation spec files exist ✓ (covers `patients`, `transactions`, `appointments`, `contacts`, `whatsapp/inbox`, `whatsapp/ai-corrections`, `whatsapp/approve-drafts`, `karne`, `members`, `settings`, `audit-logs`, `webhook-subscriptions`, `api-keys`, `scorecard/auto-fill`, `scorecard/compare`, `ad-metrics`, `integrations/ads/ads.sync`, `integrations/ghl/{ghl.sync, ghl.reconcile}`, `db/external-ids`, `common/auth-or-api-key`, `common/contract-parity`, `tenant/tenant-rls`, `tenant/tenant-context.integration`, plus unit). **But**: `tenants` controller has no isolation spec (see Medium finding); i18n catalogue rule mostly violated by existing UI (Turkish hardcoded); permissions model has only 3 resources for 20 controllers (see High finding). |

---

## Section 4 — Architectural opinions

### Things that are wrong, but leave it
1. **`tenants` table without RLS.** This is a deliberate choice — better-auth owns org lifecycle, and `tenants` is a derived registry. The team has reasoned about it. The current comments and migration order show they understand the trade-off. Don't move `tenants` under RLS without rewriting the BullMQ scheduler enumeration path (`queue.service.ts:207`), which legitimately needs to read all tenants without a tenant context.
2. **Hand-maintained OpenAPI.** This was probably the right call before there were many endpoints. Now it's a maintenance trap. The right fix is to *delete the doc mount in production* until a generator lands; the doc is more dangerous as reconnaissance than useful as a contract.
3. **3-resource permission model.** This is wrong in principle (`settings:update` overloads 8 distinct concepts). But adding resources now means re-doing the role matrix in `permissions.ts:28–58`, which the team has thought carefully about. The marginal benefit at one real tenant is zero; the marginal cost (role regression risk in production) is non-zero. Pilot it at the first real org, then expand.
4. **No rate limit on protected API.** Intentional ("karne is the rate-limited surface"). Will hurt under sustained load. The fix isn't expensive but it touches every controller. Add when the second real tenant comes online.

### Things that should be deleted (complexity worth removing)
1. **Bull Board's `ADMIN_QUEUE_TOKEN` mechanism** in its current form. If the operator needs a queue UI, point it at the Coolify deployment's admin interface or a Redis client. The custom token path is solo-maintainer burden for marginal value.
2. **The `bullmqJobId` column on `jobs`.** It's informational only; the `id` (UUID) already correlates. Drop the column.
3. **The duplicate-tenant logic in the `appts` callback state.** `ghl-oauth.state.ts` carries a `provider` field and validates it matches — but the only provider in this controller is `ghl`. The cross-provider bind was speculative. S-effort to remove; no downside.

### Things that are right and should stay
1. **Reflection-based invariant enforcement.** `idempotency-coverage.spec.ts` is the gold standard. Apply the same pattern to `controller-permissions.spec.ts` and to a future `@UseGuards` coverage test. The team has internalized "convention + test = invariant."
2. **Per-tenant composite indexes everywhere.** `apps/api/drizzle/0004–0018_*.sql` consistently start with `tenant_id` in indexes. Excellent.
3. **`VOLATILE` GUC function + tx-scoped set_config.** Migration 0002 + `tenant-context.service.ts`. The team diagnosed a postgres.js prepared-statement RLS bypass and fixed it. This is a real-world bug they hit and closed.
4. **Advisory transaction locks for webhook idempotency.** `pg_advisory_xact_lock(hashtextextended(lockKey, 0))` in `webhooks.controller.ts:169, 272`. Classic move; well-placed.
5. **TEST-01 documented scope honesty.** `apps/api/src/appointments/appointments.isolation.spec.ts:21–24` says "Not runnable in this sandbox (no docker); written and reasoned through, not executed." This is rare in AI-assisted codebases; the comment tells the next reviewer exactly what's covered and what's aspirational. More of this.

---

## Section 5 — Recommended sequence

### Before pilot (blocking)

1. **WEBHOOK-01 — bind tenant to provider, not header.** Implement the `tenant_provider_identities` table per the existing design (`docs/2026-08-03-YAPILACAKLAR.md:24–33`). Add `webhooks.cross-tenant-isolation.spec.ts` proving a valid signature with the wrong `X-Tenant-Id` is rejected. Migration + controller + 2 specs. **M.**
2. **Fix tenant-timezone handling in two places.** (a) `patients.service.ts:516–518` — add `where(eq(tenants.id, tenantId))` (or pass `tenantId` and use it). (b) `reports.service.ts:75–82, 458, 461` — replace `startOfDayUtc` / `dayAfterUtc` with timezone-aware versions using the same pattern as `appointments.service.ts:16, 26, 30`. Both use `toTenantDayKey` / `tenantDayRange` from `@verimaya/shared`. Add `apps/api/src/tenants/tenants.isolation.spec.ts` (paired regression — see Medium finding). **S.**
3. **Add `app.enableShutdownHooks()` in `main.ts`.** One-line fix; lets Coolify's SIGTERM drain HTTP and BullMQ. Without it, every deploy loses queued work. **S.**
4. **API key schema: add `last_used_at` and `expires_at`.** Migration to add columns; update `app.lookup_api_key` to filter expired; one-line UPDATE in `ApiKeyGuard` after successful lookup; scheduled job to revoke keys unused for 180 days. **M.**
5. **Tighten JSON body limit + add rate limiting on `/v1/*`.** Drop Fastify `bodyLimit` from 25 MB to 1 MB at `apps/api/src/main.ts:120–128` (keep multipart's 25 MB cap for actual uploads). Add a per-user/per-IP token bucket on `/v1/auth/*` (login + password reset) at 10/min. Add a per-tenant token bucket on the rest of `/v1/*` at e.g. 600/min, backed by Redis so multi-process counts are accurate. **S + M.**
6. **Hard-delete the public OpenAPI/Scalar mount + lock Bull Board in production.** Comment out `await mountOpenApiDocs(app)` in `main.ts:186` behind `if (process.env.NODE_ENV !== 'production')`. Or gate behind a shared token. Bull Board, ditto — disable by default in production, token-gate otherwise. **S.**
7. **Sanity-check BullMQ scheduler env on every deploy.** Add a startup check: in `NODE_ENV=production`, log WARN if `ENABLE_INTEGRATION_SCHEDULERS != 'true'`. **S.**
8. **Disable better-auth org delete in production.** Override the `organization.delete` route or set a flag. Add a spec asserting it's disabled. **S.**
9. **Pino redact paths + Sentry `beforeSend` redaction.** Add `redact` to pino config; add `beforeSend` to Sentry init that scrubs `err.message`/`err.cause.message`/`extra.*`. Also scrub the LLM error body in `openai-compatible-llm.client.ts:120, 176` — never log upstream response body. **S.**

Total before-pilot: M × 3 + S × 6 ≈ 3–4 days of work.

Note on KVKK aydınlatma: the public page itself can ship quickly (S-effort if legal review is the bottleneck), but the data-subject-rights endpoints (m.11) require product decisions on what "deletion" means in a multi-tenant retention-required system. Move to after-pilot if the lawyer's draft is in hand; otherwise it is a pilot blocker for any clinic that asks "where is your privacy notice?".

### After pilot (next 90 days)

8. **Make OrgPermissionGuard run for API-key auth, OR define explicit API-key scopes.** `apps/api/src/common/org-permission.guard.ts:29–31` short-circuits on `apiKeyAuth`, so any leaked `vk_*` token has tenant-admin powers. Either fold API-key auth into the same per-resource checks as sessions, or define per-key scope strings (`patients:write`, `settings:write`, etc.) and map them to required resources. **M (option a) to L (option b).**
9. **Move OpenAPI to generator.** Lock down the public mount until it's generated. Either delete the mount in prod (cheap, blocks reconnaissance) or invest in `@nestjs/swagger` and CI step. **M.**
10. **Expand permission resources.** Add `audit`, `members`, `api_keys`, `webhook_subscriptions`, `scorecard` to `permissions.ts`. Update `controller-permissions.spec.ts` to be reflection-based. **M.**
11. **Per-tenant webhook secrets** (already covered by WEBHOOK-01) — extend to outbound webhook subscriptions too. Currently outbound (`outbox.processor.ts`) uses per-subscription secret from `webhook_subscriptions.secretCiphertext` — correct. No change needed.
12. **Reflection-based `@UseGuards` coverage test.** Same pattern as idempotency-coverage.spec.ts. Add to `apps/api/src/common/`. **S–M.**
13. **DLQ for outbox + scheduler jobs.** Increase `attempts` or add a `requeue-from-failed` scheduled job for `outbox_events.status='failed'` and the scheduled reconcilers. Currently exhausted jobs are only logged; no persistent failure record beyond `jobs` row. **M.**
14. **Move tenants FK behavior to restrict + soft-delete.** Compliance with Turkish retention law + KVKK right-to-erasure requires keeping financial records for 10y but allowing erasure of operational data. Plan the partition. **L.**
15. **KVKK m.11 data-subject rights endpoints.** `/v1/me/data-export`, `/v1/me/data-deletion-request`. Pair with `tenants.data_retention_until` for soft-delete logic. **L.**
16. **Magic-byte MIME sniff on file uploads.** Add `file-type` (or `mmmagic`) check in `createFileWithDb`; reject mismatched declarations. Add `multipart.limits.allowedMimeTypes` allowlist. The S3 driver needs the same. **M.**
17. **KVKK aydınlatma hukuk onayı + lead capture flag turn-on.** Already on the list (`docs/2026-08-03-YAPILACAKLAR.md:49–55`). Owner: outside counsel. Not engineering.
18. **i18n catalogue sweep.** Move hardcoded Turkish strings to `messages.ts` incrementally as routes are touched. Or schedule a focused refactor. **L.**

### Dependencies
- WEBHOOK-01 must land before any second tenant exists.
- Hard-delete of OpenAPI mount must land before any external third-party sees the URL.
- Rate limiting + body-limit tightening must land before pilot, not after — once a real clinic complains about being throttled it's harder to add.
- API key rotation + graceful shutdown are operational hygiene; cheap to land now, expensive to debug at 3 a.m. later.
- Permission resource expansion is safe to defer until the first real multi-role org exercises it.
- KVKK aydınlatma and m.11 endpoints should land before pilot if legal review is unblocked; otherwise move to after-pilot with explicit acknowledgement.

---

## Appendix A — Counts and quick facts

- **Spec files:** 67 (verified: `find apps -name "*.spec.ts" -not -path "*node_modules*" | wc -l`). Of those: 30 `*.isolation.spec.ts` (real Postgres, two-tenant), 1 `tenant-context.integration.spec.ts`, plus unit/spec tests for adapters and helpers.
- **Migrations:** 23 SQL files in `apps/api/drizzle/`; 13 enable RLS on the relevant tables; 5 modify/alter existing tables (no `ENABLE` statement by design).
- **Controllers:** 20 (`@Controller` decorators found). All but `webhooks`, `karne`, `health`, `me` are tenant-scoped.
- **Mutation handlers audited:** 53 (per `idempotency-coverage.spec.ts:104` — the test asserts this exact number, so the invariant is self-checking).
- **Svelte 4 syntax violations:** 0 across 73 `.svelte` files.
- **i18n catalogue keys:** 596 entries (~298 unique).
- **Web fetches in domain code:** 1 (`apps/api/src/queue/outbox.processor.ts:52`) — intentional.
- **Hardcoded Turkish strings on patient page:** ≥8 spot-checked in one file.

## Appendix B — Items I explicitly did not verify

- **Behavior of better-auth's internal queries against the auth tables.** The team has acknowledged (TEHDIT-MODELI §1–§2) that auth tables have no RLS. I did not enumerate which `select`/`update` queries better-auth runs at runtime; the threat model acknowledges this and treats it as accepted risk.
- **Actual behavior of `Intl.supportedValuesOf('timeZone')` on the target Node version.** The fix recommendation (validate IANA timezone names) is small; whether the runtime supports it depends on the Coolify Node image version. Unverified.
- **Production replica count and whether `MIN_REQUEST_GAP_MS` in GhlHttpClient is sufficient.** The threat model §4 documents this; I did not check `docs/DEPLOY-COOLIFY.md` for the actual replica setting.
- **CI runs of all 67 specs.** I confirmed CI invokes `pnpm --filter @verimaya/api test` (`.github/workflows/ci.yml:88`) which runs all spec files, and that Postgres+Redis services are available (`ci.yml:13–39`). I did not run the suite locally; no top-of-head pass/fail data.
- **Whether the SvelteKit SPA ever sends CORS-requiring custom headers from the browser.** I verified the header is in `allowedHeaders` (`main.ts:136`) but did not trace every fetch from `apps/web/src/`.
- **The `apps/web/src/routes/(public)/vitrin` directory** is still present and `AGENTS.md` says it's prerender/legacy. I did not read its contents to verify it has no live code paths.
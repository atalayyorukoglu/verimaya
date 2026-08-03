import { SetMetadata } from '@nestjs/common';

/**
 * IDEM-01 (Faz 4.1): every mutating (POST/PUT/PATCH/DELETE) handler must declare its
 * Idempotency-Key stance — either `@Idempotent()` (wired through IdempotencyService.run())
 * or `@IdempotencyExempt('reason')` (deliberately not wired, with a reason). This makes the
 * decision visible in-code instead of implicit, and `idempotency-coverage.spec.ts` fails the
 * build if any mutating handler (or newly added one) carries neither — see that file for the
 * enforcement mechanism. Class-level application (e.g. a whole public/unauthenticated
 * controller) is supported; method-level metadata wins when both are present.
 */
export const IDEMPOTENCY_METADATA_KEY = 'idempotency:policy';

export type IdempotencyPolicy = { kind: 'enforced' } | { kind: 'exempt'; reason: string };

/** Handler is wired through `IdempotencyService.run()` — replay is keyed on tenant+key+method+normalized_path. */
export const Idempotent = () =>
	SetMetadata<string, IdempotencyPolicy>(IDEMPOTENCY_METADATA_KEY, { kind: 'enforced' });

/**
 * Handler (or, applied to a controller class, every handler in it) is intentionally not
 * wired through IdempotencyService. `reason` is mandatory and is what
 * `idempotency-coverage.spec.ts` surfaces on drift — this is the in-code justification
 * IDEM-01 requires for anything left out of enforcement.
 */
export const IdempotencyExempt = (reason: string) =>
	SetMetadata<string, IdempotencyPolicy>(IDEMPOTENCY_METADATA_KEY, { kind: 'exempt', reason });

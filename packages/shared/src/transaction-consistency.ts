import { z } from 'zod';
import { moneyMinor, supportedCurrencySchema, uuid } from './common.js';
import {
	transactionKindSchema,
	transactionStatusSchema,
} from './transaction.js';

/**
 * Shared transaction consistency / audit rules (G-03 + G-04).
 * Pure functions — used by `GET /v1/reports/consistency` (saved rows) and
 * `POST /v1/transactions/audit-draft` (unsaved form body). One rule set only.
 *
 * Out of scope (Tracker relational / category→case policies): case_required,
 * case_forbidden, contact_type_mismatch, personal payer/payee, etc.
 */

export const transactionConsistencySeveritySchema = z.enum([
	'warning',
	'error',
]);
export type TransactionConsistencySeverity = z.infer<
	typeof transactionConsistencySeveritySchema
>;

export const transactionConsistencyCodeSchema = z.enum([
	'category_missing',
	'income_contact_missing',
	'expense_contact_missing',
	'fx_missing',
	'paid_amount_mismatch',
	'unpaid_with_payment',
	'partial_amount_invalid',
	/** contact_id and responsible_contact_id refer to the same person */
	'contact_equals_responsible',
	/** responsible contact exists but is_internal is false */
	'responsible_not_internal',
]);
export type TransactionConsistencyCode = z.infer<
	typeof transactionConsistencyCodeSchema
>;

export const transactionConsistencyCodeMeta: Record<
	TransactionConsistencyCode,
	{ severity: TransactionConsistencySeverity; message_key: string }
> = {
	category_missing: {
		severity: 'warning',
		message_key: 'reports.consistency.category_missing',
	},
	income_contact_missing: {
		severity: 'warning',
		message_key: 'reports.consistency.income_contact_missing',
	},
	expense_contact_missing: {
		severity: 'warning',
		message_key: 'reports.consistency.expense_contact_missing',
	},
	fx_missing: {
		severity: 'warning',
		message_key: 'reports.consistency.fx_missing',
	},
	paid_amount_mismatch: {
		severity: 'error',
		message_key: 'reports.consistency.paid_amount_mismatch',
	},
	unpaid_with_payment: {
		severity: 'error',
		message_key: 'reports.consistency.unpaid_with_payment',
	},
	partial_amount_invalid: {
		severity: 'error',
		message_key: 'reports.consistency.partial_amount_invalid',
	},
	contact_equals_responsible: {
		severity: 'error',
		message_key: 'reports.consistency.contact_equals_responsible',
	},
	responsible_not_internal: {
		severity: 'warning',
		message_key: 'reports.consistency.responsible_not_internal',
	},
};

export type TransactionConsistencyIssue = {
	severity: TransactionConsistencySeverity;
	code: TransactionConsistencyCode;
	message_key: string;
};

/**
 * Fields needed to evaluate rules. Saved rows and unsaved drafts share this shape.
 * `responsible_is_internal` is enrichment from DB (omit / null when unknown — rule skipped).
 */
export type TransactionConsistencyInput = {
	kind?: string | null;
	category?: string | null;
	contact_id?: string | null;
	contact_label?: string | null;
	case_contact_id?: string | null;
	responsible_contact_id?: string | null;
	currency?: string | null;
	amount?: number | null;
	paid_amount?: number | null;
	amount_base?: number | null;
	status?: string | null;
	responsible_is_internal?: boolean | null;
};

function issue(code: TransactionConsistencyCode): TransactionConsistencyIssue {
	const meta = transactionConsistencyCodeMeta[code];
	return { severity: meta.severity, code, message_key: meta.message_key };
}

/**
 * Evaluate consistency rules for one transaction body (saved or draft).
 * Never throws; never mutates. Does not block saves — callers display only.
 */
export function evaluateTransactionConsistency(
	input: TransactionConsistencyInput,
	opts: { baseCurrency: string },
): TransactionConsistencyIssue[] {
	const out: TransactionConsistencyIssue[] = [];
	const category = (input.category ?? '').trim();
	const contactLabel = (input.contact_label ?? '').trim();
	const currency = (input.currency ?? '').trim().toUpperCase();
	const base = (opts.baseCurrency ?? '').trim().toUpperCase();
	const kind = input.kind ?? null;
	const status = input.status ?? null;
	const amount = input.amount ?? null;
	const paidAmount = input.paid_amount ?? null;
	const amountBase = input.amount_base ?? null;
	const contactId = input.contact_id ?? null;
	const responsibleId = input.responsible_contact_id ?? null;

	if (!category) {
		out.push(issue('category_missing'));
	}

	if (kind === 'income' && contactId == null) {
		out.push(issue('income_contact_missing'));
	}

	if (kind === 'expense' && contactId == null && !contactLabel) {
		out.push(issue('expense_contact_missing'));
	}

	// Same-currency rows may leave amount_base null on purpose (ETL-ESLEME §3.4).
	if (currency && base && currency !== base && amountBase == null) {
		out.push(issue('fx_missing'));
	}

	if (
		status === 'paid' &&
		paidAmount != null &&
		amount != null &&
		paidAmount !== amount
	) {
		out.push(issue('paid_amount_mismatch'));
	}

	if (status === 'unpaid' && (paidAmount ?? 0) > 0) {
		out.push(issue('unpaid_with_payment'));
	}

	if (
		status === 'partial' &&
		(paidAmount == null ||
			paidAmount <= 0 ||
			(amount != null && paidAmount >= amount))
	) {
		out.push(issue('partial_amount_invalid'));
	}

	if (
		contactId != null &&
		responsibleId != null &&
		contactId === responsibleId
	) {
		out.push(issue('contact_equals_responsible'));
	}

	if (responsibleId != null && input.responsible_is_internal === false) {
		out.push(issue('responsible_not_internal'));
	}

	return out;
}

/** Unsaved form body for live audit — all fields optional while the user types. */
export const transactionAuditDraftSchema = z
	.object({
		kind: transactionKindSchema.nullable().optional(),
		category: z.string().max(128).nullable().optional(),
		contact_id: uuid.nullable().optional(),
		contact_label: z.string().max(255).nullable().optional(),
		case_contact_id: uuid.nullable().optional(),
		responsible_contact_id: uuid.nullable().optional(),
		currency: supportedCurrencySchema.nullable().optional(),
		amount: moneyMinor.positive().nullable().optional(),
		paid_amount: moneyMinor.nonnegative().nullable().optional(),
		amount_base: moneyMinor.nonnegative().nullable().optional(),
		status: transactionStatusSchema.nullable().optional(),
	})
	.strict();

export type TransactionAuditDraft = z.infer<typeof transactionAuditDraftSchema>;

export const transactionAuditIssueSchema = z.object({
	severity: transactionConsistencySeveritySchema,
	code: transactionConsistencyCodeSchema,
	message_key: z.string().min(1).max(128),
});

export type TransactionAuditIssue = z.infer<typeof transactionAuditIssueSchema>;

export const transactionAuditDraftResponseSchema = z.object({
	items: z.array(transactionAuditIssueSchema),
});

export type TransactionAuditDraftResponse = z.infer<
	typeof transactionAuditDraftResponseSchema
>;

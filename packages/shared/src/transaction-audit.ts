import { z } from 'zod';
import { isoDate, uuid } from './common.js';
import { reportPeriodSchema } from './reports.js';
import {
	transactionCreateSchema,
	transactionKindSchema,
	transactionStatusSchema,
	type Transaction,
	type TransactionCreate
} from './transaction.js';

export const transactionAuditRuleSchema = z.enum([
	'income_patient_required',
	'expense_contact_required',
	'category_required',
	'paid_amount_mismatch',
	'unpaid_with_payment',
	'partial_amount_out_of_range',
	'fx_missing'
]);
export type TransactionAuditRule = z.infer<typeof transactionAuditRuleSchema>;

export const transactionAuditSeveritySchema = z.enum(['warning', 'error']);
export type TransactionAuditSeverity = z.infer<typeof transactionAuditSeveritySchema>;

export const transactionAuditIssueSchema = z.object({
	rule: transactionAuditRuleSchema,
	severity: transactionAuditSeveritySchema,
	message: z.string()
});
export type TransactionAuditIssue = z.infer<typeof transactionAuditIssueSchema>;

export const transactionAuditRowSchema = z.object({
	transaction_id: uuid.nullable(),
	title: z.string(),
	occurred_on: isoDate.optional(),
	issues: z.array(transactionAuditIssueSchema)
});
export type TransactionAuditRow = z.infer<typeof transactionAuditRowSchema>;

export const transactionAuditReportSchema = z.object({
	period: reportPeriodSchema,
	issue_count: z.number().int().nonnegative(),
	items: z.array(transactionAuditRowSchema)
});
export type TransactionAuditReport = z.infer<typeof transactionAuditReportSchema>;

/** Unsaved form payload — same rules as persisted rows. */
export const transactionAuditDraftInputSchema = transactionCreateSchema
	.partial()
	.extend({
		title: z.string().min(1).max(255).optional(),
		kind: transactionKindSchema.optional(),
		status: transactionStatusSchema.optional()
	});
export type TransactionAuditDraftInput = z.infer<typeof transactionAuditDraftInputSchema>;

export const transactionAuditDraftResultSchema = z.object({
	issues: z.array(transactionAuditIssueSchema)
});
export type TransactionAuditDraftResult = z.infer<typeof transactionAuditDraftResultSchema>;

type AuditInput = Pick<
	Transaction | TransactionCreate,
	| 'kind'
	| 'title'
	| 'category'
	| 'status'
	| 'amount'
	| 'paid_amount'
	| 'currency'
	| 'amount_base'
	| 'base_currency'
	| 'patient_id'
	| 'contact_label'
>;

function pushIssue(
	issues: TransactionAuditIssue[],
	rule: TransactionAuditRule,
	severity: TransactionAuditSeverity,
	message: string
) {
	issues.push({ rule, severity, message });
}

/** Pure rule engine — shared by API audit + draft endpoints. */
export function auditTransactionInput(
	input: AuditInput,
	tenantBaseCurrency: string
): TransactionAuditIssue[] {
	const issues: TransactionAuditIssue[] = [];

	if (input.kind === 'income' && !input.patient_id) {
		pushIssue(
			issues,
			'income_patient_required',
			'warning',
			'Income row has no patient selected.'
		);
	}

	if (input.kind === 'expense' && !input.contact_label?.trim()) {
		pushIssue(
			issues,
			'expense_contact_required',
			'warning',
			'Expense row has no contact/counterparty label.'
		);
	}

	if (!input.category?.trim()) {
		pushIssue(issues, 'category_required', 'warning', 'Category is empty.');
	}

	const paid = input.paid_amount ?? 0;
	if (input.status === 'paid' && paid !== input.amount) {
		pushIssue(
			issues,
			'paid_amount_mismatch',
			'error',
			'Status is paid but paid_amount does not equal amount.'
		);
	}

	if (input.status === 'unpaid' && paid > 0) {
		pushIssue(
			issues,
			'unpaid_with_payment',
			'error',
			'Status is unpaid but paid_amount is greater than zero.'
		);
	}

	if (input.status === 'partial') {
		if (paid <= 0 || paid >= input.amount) {
			pushIssue(
				issues,
				'partial_amount_out_of_range',
				'error',
				'Partial status requires 0 < paid_amount < amount.'
			);
		}
	}

	const needsFx =
		input.currency !== tenantBaseCurrency &&
		(input.amount_base == null || input.base_currency == null);
	if (needsFx) {
		pushIssue(
			issues,
			'fx_missing',
			'error',
			`Base amount snapshot missing (${input.currency} → ${tenantBaseCurrency}).`
		);
	}

	return issues;
}

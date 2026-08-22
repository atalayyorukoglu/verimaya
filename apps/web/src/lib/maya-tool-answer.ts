import type { MayaToolName, MayaToolResult } from '@verimaya/shared';
import { t } from '$lib/i18n/locale.svelte';
import type { MessageKey } from '$lib/i18n/messages';
import { formatDate, formatDateTime, formatMoney } from '$lib/format';

/**
 * AI-11a — araç sonucundan cevap metni **burada** kurulur.
 *
 * Değişmez desen: rakamı Postgres verir, cümleyi kod kurar. Model ne rakam üretir ne
 * cümle yazar; sunucudan gelen `tool_result` yalnız sayılar ve etiketlerdir, cümle
 * kalıbı `messages.ts` anahtarlarındadır (tr + en).
 */

const TOOL_LABEL_KEYS = {
	contactBalance: 'maya.tool.name.contactBalance',
	openBalances: 'maya.tool.name.openBalances',
	contactAppointments: 'maya.tool.name.contactAppointments',
	periodSummary: 'maya.tool.name.periodSummary',
	untouchedContacts: 'maya.tool.name.untouchedContacts'
} as const satisfies Record<MayaToolName, MessageKey>;

export function mayaToolLabel(tool: MayaToolName): string {
	return t(TOOL_LABEL_KEYS[tool]);
}

/** Kaç satır gösterildiyse geri kalanı için "… ve N tane daha" satırı. */
function moreLine(shown: number, total: number): string[] {
	return total > shown ? [t('maya.tool.moreItems', { count: total - shown })] : [];
}

export function mayaToolAnswerText(result: MayaToolResult): string {
	switch (result.tool) {
		case 'contactBalance':
			return t('maya.tool.contactBalance.answer', {
				name: result.contact_label,
				outstanding: formatMoney(result.outstanding_base, result.base_currency),
				income: formatMoney(result.income_base, result.base_currency),
				paid: formatMoney(result.paid_base, result.base_currency),
				count: result.transaction_count
			});

		case 'openBalances': {
			if (result.total_count === 0) return t('maya.tool.openBalances.empty');
			const rows = result.items.map((row) =>
				t('maya.tool.openBalances.row', {
					name: row.contact_label,
					amount: formatMoney(row.open_amount, row.currency)
				})
			);
			return [
				t('maya.tool.openBalances.answer', { count: result.total_count }),
				...rows,
				...moreLine(result.items.length, result.total_count)
			].join('\n');
		}

		case 'contactAppointments': {
			if (result.total_count === 0) {
				return t('maya.tool.contactAppointments.empty', { name: result.contact_label });
			}
			const rows = result.items.map((row) =>
				t('maya.tool.contactAppointments.row', {
					when: formatDateTime(row.starts_at),
					title: row.title?.trim() || t('maya.tool.contactAppointments.untitled')
				})
			);
			return [
				t('maya.tool.contactAppointments.answer', {
					name: result.contact_label,
					count: result.total_count
				}),
				...rows,
				...moreLine(result.items.length, result.total_count)
			].join('\n');
		}

		case 'periodSummary':
			return t('maya.tool.periodSummary.answer', {
				from: formatDate(`${result.from}T00:00:00.000Z`),
				to: formatDate(`${result.to}T00:00:00.000Z`),
				income: formatMoney(result.income_base, result.base_currency),
				expense: formatMoney(result.expense_base, result.base_currency),
				net: formatMoney(result.net_base, result.base_currency),
				pending: formatMoney(result.pending_base, result.base_currency),
				count: result.transaction_count
			});

		case 'untouchedContacts': {
			if (result.total === 0) {
				return t('maya.tool.untouchedContacts.empty', { days: result.days });
			}
			const rows = result.items.map((row) =>
				t('maya.tool.untouchedContacts.row', {
					name: row.display_name,
					days: row.days_since
				})
			);
			return [
				t('maya.tool.untouchedContacts.answer', {
					days: result.days,
					total: result.total,
					d30: result.buckets.d30,
					d60: result.buckets.d60,
					d90: result.buckets.d90
				}),
				...rows,
				...moreLine(result.items.length, result.total)
			].join('\n');
		}
	}
}

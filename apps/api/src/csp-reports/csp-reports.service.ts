import { Injectable } from '@nestjs/common';
import { desc, sql } from 'drizzle-orm';
import type { CspReport, CspReportList } from '@verimaya/shared';
import { DbService } from '../db/db.service';
import { cspReports } from '../db/schema/csp-reports';
import {
	normalizeCspReportBody,
	userAgentFamily,
	type NormalizedCspReport
} from './csp-reports.parse';

@Injectable()
export class CspReportsService {
	constructor(private readonly db: DbService) {}

	/**
	 * Persist one normalized report. Unknown/empty bodies are ignored (false).
	 */
	async ingest(body: unknown, userAgent: string | undefined): Promise<boolean> {
		const normalized = normalizeCspReportBody(body);
		if (!normalized) return false;
		await this.upsert(normalized, userAgentFamily(userAgent));
		return true;
	}

	async list(): Promise<CspReportList> {
		const rows = await this.db.client
			.select()
			.from(cspReports)
			.orderBy(desc(cspReports.count), desc(cspReports.lastSeenAt));
		return { items: rows.map(toCspReport) };
	}

	async clear(): Promise<{ deleted: true }> {
		await this.db.client.delete(cspReports);
		return { deleted: true };
	}

	private async upsert(report: NormalizedCspReport, uaFamily: string | null): Promise<void> {
		await this.db.client
			.insert(cspReports)
			.values({
				documentUri: report.documentUri,
				blockedUri: report.blockedUri,
				violatedDirective: report.violatedDirective,
				effectiveDirective: report.effectiveDirective,
				disposition: report.disposition,
				userAgentFamily: uaFamily,
				count: 1
			})
			.onConflictDoUpdate({
				target: [
					cspReports.documentUri,
					cspReports.blockedUri,
					cspReports.violatedDirective
				],
				set: {
					count: sql`${cspReports.count} + 1`,
					lastSeenAt: sql`now()`,
					effectiveDirective: report.effectiveDirective,
					disposition: report.disposition,
					userAgentFamily: uaFamily
				}
			});
	}
}

function toCspReport(row: typeof cspReports.$inferSelect): CspReport {
	return {
		id: row.id,
		document_uri: row.documentUri,
		blocked_uri: row.blockedUri,
		violated_directive: row.violatedDirective,
		effective_directive: row.effectiveDirective,
		disposition: row.disposition,
		user_agent_family: row.userAgentFamily,
		count: row.count,
		first_seen_at: row.firstSeenAt.toISOString(),
		last_seen_at: row.lastSeenAt.toISOString()
	};
}

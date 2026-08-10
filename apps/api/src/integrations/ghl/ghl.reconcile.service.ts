import { Inject, Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { jobs } from '../../db/schema';
import { GHL_RECONCILE_JOB_TYPE } from '../../queue/queue.constants';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { ghlHttpClientEnvConfigured } from './ghl.client.http';
import { GHL_OAUTH_PROVIDER } from './ghl-oauth.state';
import { GhlSyncService } from './ghl.sync.service';
import {
	GHL_CLIENT,
	type GhlClient,
	type GhlRemoteContact
} from './ghl.types';

/** Plan Adım 43: pull window for contact dateUpdated filter. */
export const GHL_RECONCILE_LOOKBACK_DAYS = 7;
const MAX_PAGES = 50;
const PAGE_SIZE = 100;
const MAX_DIFFS_IN_LEDGER = 50;

export type GhlReconcileDiff = {
	externalId: string;
	kind: 'created' | 'updated';
	fields: string[];
	contactId: string | null;
};

export type GhlReconcileResult = {
	mode: 'live' | 'skipped_no_oauth' | 'skipped_no_app_credentials';
	lookbackDays: number;
	scanned: number;
	created: number;
	updated: number;
	unchanged: number;
	skipped: number;
	diffCount: number;
	diffs: GhlReconcileDiff[];
};

/**
 * Pulls GHL contacts and applies ownership-aware upserts (Adım 43).
 * Kept separate from {@link GhlSyncService} to avoid Nest DI cycles with GhlHttpClient.
 */
@Injectable()
export class GhlReconcileService {
	private readonly logger = new Logger(GhlReconcileService.name);

	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly settings: SettingsService,
		private readonly sync: GhlSyncService,
		@Inject(GHL_CLIENT) private readonly ghlClient: GhlClient
	) {}

	async reconcile(tenantId: string): Promise<GhlReconcileResult> {
		const startedAt = new Date();
		const lookbackDays = GHL_RECONCILE_LOOKBACK_DAYS;

		const cred = await this.settings.getCredentialStatus(tenantId, GHL_OAUTH_PROVIDER);
		if (!cred.configured) {
			const result = this.emptyResult('skipped_no_oauth', lookbackDays);
			await this.writeLedger(tenantId, startedAt, result);
			this.logger.debug(`ghl.reconcile skipped (no OAuth) tenant=${tenantId}`);
			return result;
		}

		if (!ghlHttpClientEnvConfigured()) {
			const result = this.emptyResult('skipped_no_app_credentials', lookbackDays);
			await this.writeLedger(tenantId, startedAt, result);
			this.logger.debug(`ghl.reconcile skipped (no GHL_CLIENT_ID/SECRET) tenant=${tenantId}`);
			return result;
		}

		const sinceMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
		const remotes = await this.pullContactsInWindow(tenantId, sinceMs);

		let created = 0;
		let updated = 0;
		let unchanged = 0;
		let skipped = 0;
		const diffs: GhlReconcileDiff[] = [];

		for (const remote of remotes) {
			const applied = await this.sync.applyRemoteContact(tenantId, remote);
			if (applied.action === 'skipped') {
				skipped += 1;
				continue;
			}
			if (applied.action === 'unchanged') {
				unchanged += 1;
				continue;
			}
			if (applied.action === 'created') {
				created += 1;
				if (diffs.length < MAX_DIFFS_IN_LEDGER) {
					diffs.push({
						externalId: remote.id,
						kind: 'created',
						fields: applied.changedFields,
						contactId: applied.contactId
					});
				}
				continue;
			}
			updated += 1;
			if (diffs.length < MAX_DIFFS_IN_LEDGER) {
				diffs.push({
					externalId: remote.id,
					kind: 'updated',
					fields: applied.changedFields,
					contactId: applied.contactId
				});
			}
		}

		const result: GhlReconcileResult = {
			mode: 'live',
			lookbackDays,
			scanned: remotes.length,
			created,
			updated,
			unchanged,
			skipped,
			diffCount: created + updated,
			diffs
		};

		await this.writeLedger(tenantId, startedAt, result);
		this.logger.log(
			`ghl.reconcile tenant=${tenantId} scanned=${result.scanned} created=${created} updated=${updated} unchanged=${unchanged}`
		);
		return result;
	}

	private emptyResult(
		mode: 'skipped_no_oauth' | 'skipped_no_app_credentials',
		lookbackDays: number
	): GhlReconcileResult {
		return {
			mode,
			lookbackDays,
			scanned: 0,
			created: 0,
			updated: 0,
			unchanged: 0,
			skipped: 0,
			diffCount: 0,
			diffs: []
		};
	}

	private async pullContactsInWindow(
		tenantId: string,
		sinceMs: number
	): Promise<GhlRemoteContact[]> {
		const out: GhlRemoteContact[] = [];
		let startAfterId: string | undefined;
		for (let page = 0; page < MAX_PAGES; page++) {
			const batch = await this.ghlClient.listContacts(tenantId, {
				limit: PAGE_SIZE,
				startAfterId
			});
			for (const c of batch.contacts) {
				if (this.isInWindow(c, sinceMs)) {
					out.push(c);
				}
			}
			if (!batch.nextStartAfterId || batch.contacts.length === 0) {
				break;
			}
			startAfterId = batch.nextStartAfterId;
		}
		return out;
	}

	/** Include when dateUpdated missing (API often omits) or within lookback. */
	private isInWindow(contact: GhlRemoteContact, sinceMs: number): boolean {
		if (!contact.dateUpdated) return true;
		const t = Date.parse(contact.dateUpdated);
		if (Number.isNaN(t)) return true;
		return t >= sinceMs;
	}

	private async writeLedger(
		tenantId: string,
		startedAt: Date,
		result: GhlReconcileResult
	): Promise<void> {
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await db.insert(jobs).values({
				tenantId,
				queue: 'default',
				jobType: GHL_RECONCILE_JOB_TYPE,
				payload: { ...result },
				status: 'completed',
				startedAt,
				completedAt: new Date()
			});
		});
	}
}

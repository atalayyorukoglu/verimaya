import { Injectable } from '@nestjs/common';
import type { TransactionDraft } from '@verimaya/shared';
import { PatientsService } from '../patients/patients.service';
import { heuristicParseWhatsappMessage } from './heuristic-parse';

@Injectable()
export class WhatsappService {
	constructor(private readonly patientsService: PatientsService) {}

	async parseMessage(tenantId: string, message: string): Promise<TransactionDraft[]> {
		const { items: patients } = await this.patientsService.list(tenantId, {
			limit: 100
		});
		return heuristicParseWhatsappMessage(message, patients);
	}
}

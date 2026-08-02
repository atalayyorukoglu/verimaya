import { ServiceUnavailableException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KarneController } from './karne.controller';
import type { KarneService } from './karne.service';

const originalLeadFlag = process.env.KARNE_LEADS_ENABLED;

function makeRequest(): FastifyRequest {
	return {
		body: {
			session_id: '00000000-0000-4000-8000-000000000001',
			email: 'pilot@example.com',
			consent: true,
			website: ''
		}
	} as unknown as FastifyRequest;
}

afterEach(() => {
	if (originalLeadFlag === undefined) {
		delete process.env.KARNE_LEADS_ENABLED;
	} else {
		process.env.KARNE_LEADS_ENABLED = originalLeadFlag;
	}
});

describe('KarneController lead gate', () => {
	it('fails closed when KARNE_LEADS_ENABLED is absent', async () => {
		delete process.env.KARNE_LEADS_ENABLED;
		const createLead = vi.fn();
		const controller = new KarneController({ createLead } as unknown as KarneService);

		await expect(controller.createLead(makeRequest())).rejects.toBeInstanceOf(
			ServiceUnavailableException
		);
		expect(createLead).not.toHaveBeenCalled();
	});

	it('accepts leads only when KARNE_LEADS_ENABLED is explicitly true', async () => {
		process.env.KARNE_LEADS_ENABLED = 'true';
		const createLead = vi.fn().mockResolvedValue(undefined);
		const controller = new KarneController({ createLead } as unknown as KarneService);

		await controller.createLead(makeRequest());

		expect(createLead).toHaveBeenCalledOnce();
		expect(createLead).toHaveBeenCalledWith({
			session_id: '00000000-0000-4000-8000-000000000001',
			email: 'pilot@example.com',
			consent: true,
			website: ''
		});
	});
});

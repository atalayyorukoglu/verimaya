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

	it('fails closed with the exact karne_leads_disabled payload when absent', async () => {
		delete process.env.KARNE_LEADS_ENABLED;
		const createLead = vi.fn();
		const controller = new KarneController({ createLead } as unknown as KarneService);

		try {
			await controller.createLead(makeRequest());
			expect.unreachable('expected createLead to throw');
		} catch (err) {
			expect(err).toBeInstanceOf(ServiceUnavailableException);
			expect((err as ServiceUnavailableException).getResponse()).toEqual({
				error: {
					code: 'karne_leads_disabled',
					message: 'Karne lead capture is disabled'
				}
			});
		}
		expect(createLead).not.toHaveBeenCalled();
	});

	it('fails closed when KARNE_LEADS_ENABLED is explicitly false (not just absent)', async () => {
		process.env.KARNE_LEADS_ENABLED = 'false';
		const createLead = vi.fn();
		const controller = new KarneController({ createLead } as unknown as KarneService);

		await expect(controller.createLead(makeRequest())).rejects.toBeInstanceOf(
			ServiceUnavailableException
		);
		expect(createLead).not.toHaveBeenCalled();
	});

	it('fails closed for any non-"true" value, e.g. a truthy-looking typo', async () => {
		process.env.KARNE_LEADS_ENABLED = 'TRUE';
		const createLead = vi.fn();
		const controller = new KarneController({ createLead } as unknown as KarneService);

		await expect(controller.createLead(makeRequest())).rejects.toBeInstanceOf(
			ServiceUnavailableException
		);
		expect(createLead).not.toHaveBeenCalled();
	});

	it('accepts leads only when KARNE_LEADS_ENABLED is explicitly true', async () => {
		process.env.KARNE_LEADS_ENABLED = 'true';
		const createLead = vi.fn().mockResolvedValue({ emailed: false });
		const controller = new KarneController({ createLead } as unknown as KarneService);

		const result = await controller.createLead(makeRequest());

		expect(result).toEqual({ emailed: false });
		expect(createLead).toHaveBeenCalledOnce();
		expect(createLead).toHaveBeenCalledWith({
			session_id: '00000000-0000-4000-8000-000000000001',
			email: 'pilot@example.com',
			consent: true,
			website: ''
		});
	});
});

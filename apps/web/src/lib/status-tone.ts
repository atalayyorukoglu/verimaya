import type {
	PatientStatus,
	AppointmentStatus,
	TransactionStatus,
	FeatureStatus
} from '@verimaya/shared';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export function patientStatusTone(status: PatientStatus): Tone {
	switch (status) {
		case 'closed_won':
		case 'treated':
			return 'success';
		case 'closed_lost':
			return 'danger';
		case 'scheduled':
		case 'arrived':
			return 'brand';
		case 'qualified':
		case 'follow_up':
			return 'info';
		case 'contacted':
			return 'warning';
		default:
			return 'neutral';
	}
}

export function appointmentStatusTone(status: AppointmentStatus): Tone {
	switch (status) {
		case 'completed':
			return 'success';
		case 'cancelled':
		case 'no_show':
			return 'danger';
		case 'confirmed':
		case 'in_progress':
			return 'brand';
		default:
			return 'neutral';
	}
}

export function transactionStatusTone(status: TransactionStatus): Tone {
	switch (status) {
		case 'paid':
			return 'success';
		case 'partial':
			return 'warning';
		case 'unpaid':
			return 'danger';
	}
}

export function featureStatusTone(status: FeatureStatus): Tone {
	switch (status) {
		case 'yayinda':
			return 'success';
		case 'gelistiriliyor':
			return 'warning';
		case 'planlandi':
			return 'neutral';
	}
}

import type {
	ContactStatus,
	AppointmentStatus,
	TransactionStatus,
	FeatureStatus,
	IncidentStatus
} from '@verimaya/shared';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export function contactStatusTone(status: ContactStatus): Tone {
	switch (status) {
		case 'treated':
			return 'success';
		case 'cancelled':
			return 'danger';
		case 'scheduled':
		case 'arrived':
			return 'brand';
		case 'follow_up':
			return 'info';
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

export function incidentStatusTone(status: IncidentStatus): Tone {
	switch (status) {
		case 'resolved':
			return 'success';
		case 'open':
			return 'warning';
	}
}

export function featureStatusTone(status: FeatureStatus): Tone {
	switch (status) {
		case 'yayinda':
			return 'success';
		case 'pilotta':
			return 'brand';
		case 'kod-hazir':
			return 'info';
		case 'harici-onay-bekliyor':
			return 'warning';
	}
}

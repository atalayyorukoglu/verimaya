import type { PatientStatus } from './patient.js';
import type { AppointmentStatus } from './appointment.js';
import type { TransactionKind, TransactionStatus } from './transaction.js';
import type { ConversationStatus } from './conversation.js';
import type { FeatureStatus } from './features.js';

export const patientStatusLabels: Record<PatientStatus, string> = {
	lead: 'Lead',
	contacted: 'İletişime geçildi',
	qualified: 'Nitelikli',
	scheduled: 'Randevu alındı',
	arrived: 'Geldi',
	treated: 'Tedavi edildi',
	follow_up: 'Takip',
	closed_won: 'Kazanıldı',
	closed_lost: 'Kaybedildi'
};

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
	scheduled: 'Planlandı',
	confirmed: 'Onaylandı',
	in_progress: 'Devam ediyor',
	completed: 'Tamamlandı',
	cancelled: 'İptal',
	no_show: 'Gelmedi'
};

export const transactionKindLabels: Record<TransactionKind, string> = {
	income: 'Gelir',
	expense: 'Gider'
};

export const transactionStatusLabels: Record<TransactionStatus, string> = {
	paid: 'Ödendi',
	partial: 'Kısmi',
	unpaid: 'Ödenmedi'
};

export const conversationStatusLabels: Record<ConversationStatus, string> = {
	open: 'Açık',
	pending: 'Beklemede',
	resolved: 'Çözüldü',
	archived: 'Arşiv'
};

export const featureStatusLabels: Record<FeatureStatus, string> = {
	yayinda: 'Yayında',
	gelistiriliyor: 'Geliştiriliyor',
	planlandi: 'Planlandı'
};

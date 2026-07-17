import type { PatientStatus } from './patient.js';
import type { AppointmentStatus } from './appointment.js';
import type { TransactionKind, TransactionStatus } from './transaction.js';
import type { ConversationStatus } from './conversation.js';
import type { FeatureStatus } from './features.js';
import type { AuditAction, AuditEntity } from './audit.js';
import type { UserRole } from './user.js';

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

export const auditActionLabels: Record<AuditAction, string> = {
	create: 'Oluşturdu',
	update: 'Güncelledi',
	delete: 'Sildi',
	login: 'Giriş yaptı'
};

export const auditEntityLabels: Record<AuditEntity, string> = {
	patient: 'Hasta',
	appointment: 'Randevu',
	transaction: 'İşlem',
	conversation: 'Konuşma',
	tenant: 'Tenant',
	user: 'Kullanıcı'
};

export const userRoleLabels: Record<UserRole, string> = {
	owner: 'Sahip',
	admin: 'Yönetici',
	manager: 'Müdür',
	agent: 'Danışman',
	finance: 'Finans',
	readonly: 'Salt okunur'
};

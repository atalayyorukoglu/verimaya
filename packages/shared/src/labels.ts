import type { ContactStatus } from './contact.js';
import type { AppointmentStatus } from './appointment.js';
import type { InvoiceStatus, TransactionKind, TransactionStatus } from './transaction.js';
import type { InboundMessageStatus } from './inbound-message.js';
import type { FeatureStatus, FeatureStatusBucket } from './features.js';
import type { AuditAction, AuditEntity } from './audit.js';
import type { UserRole } from './user.js';
import type { IncidentStatus } from './incident.js';

export const contactStatusLabels: Record<ContactStatus, string> = {
	scheduled: 'Randevu alındı',
	arrived: 'Geldi',
	treated: 'Tedavi edildi',
	follow_up: 'Takip',
	cancelled: 'İptal'
};

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
	scheduled: 'Planlandı',
	confirmed: 'Onaylandı',
	in_progress: 'Devam ediyor',
	completed: 'Tamamlandı',
	cancelled: 'İptal',
	no_show: 'Gelmedi'
};

export const incidentStatusLabels: Record<IncidentStatus, string> = {
	open: 'Açık',
	resolved: 'Çözüldü'
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

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
	none: 'Yok',
	issued: 'Kesildi',
	not_issued: 'Kesilmedi'
};

export const inboundMessageStatusLabels: Record<InboundMessageStatus, string> = {
	new: 'Yeni',
	parsed: 'Ayrıştırıldı',
	approved: 'Onaylandı',
	ignored: 'Yoksayıldı'
};

/**
 * Kullanıcıya görünen kova etiketleri (toolkit filtre + rozet).
 * Dahili kod → kova: `featureStatusBucket` (features.ts).
 */
export const featureStatusBucketLabels: Record<FeatureStatusBucket, string> = {
	yayinda: 'Yayında',
	yakinda: 'Yakında',
	siradaki: 'Sıradaki',
	'fikir-defteri': 'Fikir Defteri'
};

/** Rozet metni — kullanıcı kovası dilinde (eski “Kod Hazır / Onay Bekliyor” kaldırıldı). */
export const featureStatusLabels: Record<FeatureStatus, string> = {
	'kod-hazir': featureStatusBucketLabels.yakinda,
	pilotta: featureStatusBucketLabels.yayinda,
	yayinda: featureStatusBucketLabels.yayinda,
	'harici-onay-bekliyor': featureStatusBucketLabels.siradaki,
	yakinda: featureStatusBucketLabels.siradaki,
	'fikir-defteri': featureStatusBucketLabels['fikir-defteri']
};

export const auditActionLabels: Record<AuditAction, string> = {
	create: 'Oluşturdu',
	update: 'Güncelledi',
	delete: 'Sildi',
	login: 'Giriş yaptı'
};

export const auditEntityLabels: Record<AuditEntity, string> = {
	contact: 'Kişi',
	appointment: 'Randevu',
	transaction: 'İşlem',
	inbound_message: 'WhatsApp mesajı',
	file: 'Dosya',
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

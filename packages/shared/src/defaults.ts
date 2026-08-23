/** Default contact type names seeded for new tenants. */
export const DEFAULT_CONTACT_TYPE_NAMES = [
	'Hasta',
	'Klinik',
	'Otel',
	'Transfer',
	'Personel',
	'Diğer'
] as const;

/** Default contact title (görev) names seeded for new tenants. */
export const DEFAULT_CONTACT_TITLE_NAMES = [
	'Hekim',
	'Koordinatör',
	'Satış',
	'Reklam Uzmanı',
	'Asistan',
	'Diğer'
] as const;

/** Default appointment type names seeded per tenant (deterministic IDs via defaultAppointmentTypeId). */
export const DEFAULT_APPOINTMENT_TYPE_NAMES = [
	'Konsültasyon',
	'Tedavi',
	'Kontrol',
	'Transfer'
] as const;

/**
 * Default incident type names seeded per tenant — `clinic` alanı ile SINIRLI (v1).
 * docs/2026-08-23-maya-icgoru-sorulari.md § 5: klinik döngüsünün çalıştığı kanıtlanmadan
 * diğer beş alanın (hotel/transfer/sales/marketing/coordination) tür listesi yazılmaz.
 */
export const DEFAULT_INCIDENT_TYPE_NAMES_CLINIC = [
	'Revizyon gerekti',
	'Sonuç beklentinin altında',
	'Komplikasyon',
	'Süreç gecikmesi'
] as const;

export type DefaultFinanceCategorySeed = {
	kind: 'income' | 'expense';
	name: string;
	subcategories: string[];
};

/** Default finance category seeds for new tenants. */
export const DEFAULT_FINANCE_CATEGORY_SEEDS: DefaultFinanceCategorySeed[] = [
	{
		kind: 'income',
		name: 'Operasyon',
		subcategories: ['Saç ekimi', 'İmplant', 'Konsültasyon', 'Genel']
	},
	{
		kind: 'expense',
		name: 'Operasyon',
		subcategories: ['Saç ekimi', 'İmplant', 'Konsültasyon', 'Genel']
	},
	{
		kind: 'expense',
		name: 'Konaklama',
		subcategories: ['Otel', 'Extra gece', 'Erken check-in']
	},
	{
		kind: 'expense',
		name: 'Transfer',
		subcategories: ['Havalimanı', 'Şehir içi', 'Şehirler arası']
	},
	{
		kind: 'expense',
		name: 'Pazarlama',
		subcategories: ['Meta Ads', 'Google Ads', 'Ajans']
	},
	{ kind: 'income', name: 'Diğer', subcategories: ['Genel'] }
];

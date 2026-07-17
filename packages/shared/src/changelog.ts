export type ChangeType = 'eklendi' | 'degisti' | 'duzeltildi' | 'kaldirildi' | 'guvenlik';

export type ChangelogChange = {
	type: ChangeType;
	module: string;
	text: string;
	featureId?: string;
};

export type ChangelogEntry = {
	version: string;
	date: string;
	title?: string;
	changes: ChangelogChange[];
};

/**
 * Tek kaynak: /yenilikler + (ileride) CHANGELOG.md buradan beslenir.
 * docs/CHANGELOG-KURALLARI.md
 */
export const changelog: ChangelogEntry[] = [
	{
		version: '0.1.0',
		date: '2026-07-17',
		title: 'Faz 0a iskeleti',
		changes: [
			{
				type: 'eklendi',
				module: 'Platform',
				text: 'Panel iskeleti açıldı: sol menü, hızlı arama çubuğu ve koyu tema ile demo ortamı hazır.'
			},
			{
				type: 'eklendi',
				module: 'Hastalar',
				text: 'Hasta listesi ve detay ekranlarının ilk taslağı demo veriyle denenebilir.'
			}
		]
	}
];

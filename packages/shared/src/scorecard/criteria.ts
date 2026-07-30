/**
 * 43 criteria × band applicability — Olcek-Profili-Spec.md v3 §4.
 * Do not merge with free karne (`apps/web/src/lib/karne/`).
 */

import type {
	BandApplicabilityKind,
	ScorecardBandId,
	ScorecardCriterion,
	SetupAnswers
} from './types.js';

const V = 'valid' as const;
const R = 'restated' as const;
const N = 'na' as const;
const G = 'setupGated' as const;

function row(
	a: BandApplicabilityKind,
	b: BandApplicabilityKind,
	c: BandApplicabilityKind
): Record<ScorecardBandId, BandApplicabilityKind> {
	return { '1-4': a, '5-15': b, '16+': c };
}

export const SCORECARD_CRITERIA: readonly ScorecardCriterion[] = [
	// --- 1. Strateji ×1,5 ---
	{
		id: '1.1',
		dimension: 'strategy',
		text: 'Projeler ölçülebilir bir üst hedefe bağlı mı?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '1.2',
		dimension: 'strategy',
		text: 'Sayı, sorumlu, tarih yazılı mı?',
		bandApplicability: row(R, V, V),
		restatedText: {
			'1-4': 'Sayı ve tarih yazılı mı? (Sorumlu bu bantta apaçık.)'
		}
	},
	{
		id: '1.3',
		dimension: 'strategy',
		text: 'Golden Triangle (yönetim+kullanıcı+tedarikçi) kuruldu mu?',
		bandApplicability: row(R, R, V),
		restatedText: {
			'1-4': 'Tedarikçiye sordun mu, işi fiilen yapanı dinledin mi?',
			'5-15': 'Tedarikçiye sordun mu, işi fiilen yapanı dinledin mi?'
		}
	},
	{
		id: '1.4',
		dimension: 'strategy',
		text: 'Bütçe kalıcı hatta mı, pilot bütçesi mi?',
		bandApplicability: row(N, V, V)
	},
	{
		id: '1.5',
		dimension: 'strategy',
		text: 'Kurumun onaylı yapay zeka stratejisi var mı?',
		bandApplicability: row(N, N, V)
	},

	// --- 2. Veri ×1,5 ---
	{
		id: '2.1',
		dimension: 'data',
		text: 'Kritik terimlerin tek yazılı tanımı var mı?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '2.2',
		dimension: 'data',
		text: 'İhtiyaç sahibi veriye kaç adımda ulaşıyor?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '2.3',
		dimension: 'data',
		text: 'Tanımı değiştirebilecek isimli sahip var mı?',
		bandApplicability: row(N, V, V)
	},
	{
		id: '2.4',
		dimension: 'data',
		text: 'Aynı veri kaç sistemde, senkron mu?',
		bandApplicability: row(V, V, V),
		criticalityNote: { '1-4': 'elevated', '5-15': 'elevated' }
	},
	{
		id: '2.5',
		dimension: 'data',
		text: 'Bu soruların sahibi olan bir rol var mı?',
		bandApplicability: row(N, N, V)
	},

	// --- 3. Teknoloji ×1 ---
	{
		id: '3.1',
		dimension: 'technology',
		text: 'Tedarikçinin veri işleme cevabı yazılı mı?',
		bandApplicability: row(V, V, V),
		criticalityNote: { '1-4': 'elevated', '5-15': 'elevated' }
	},
	{
		id: '3.2',
		dimension: 'technology',
		text: 'Model sağlayıcı ve sürüm biliniyor mu?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '3.3',
		dimension: 'technology',
		text: 'Ölçeklenme test edildi mi?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '3.4',
		dimension: 'technology',
		text: 'Yazılı SLA var mı?',
		bandApplicability: row(V, V, V),
		criticalityNote: { '1-4': 'elevated', '5-15': 'elevated' }
	},
	{
		id: '3.5',
		dimension: 'technology',
		text: 'Çıkış (veri taşınabilirliği) yazılı mı?',
		bandApplicability: row(V, V, V),
		criticalityNote: { '1-4': 'critical', '5-15': 'critical' }
	},
	{
		id: '3.6',
		dimension: 'technology',
		text: 'Her araç için bakımını üstlenen isimli biri var mı?',
		bandApplicability: row(V, V, V)
	},

	// --- 4. İnsan ×1 ---
	{
		id: '4.1',
		dimension: 'people',
		text: 'Her fonksiyonda resmî araç erişimi biliniyor mu?',
		bandApplicability: row(G, G, G),
		setupQuestion: 'S2',
		restatedText: {
			'5-15': 'Herkesin resmî bir aracı var mı?'
		}
	},
	{
		id: '4.2',
		dimension: 'people',
		text: 'Lisans alanların ne kadarı düzenli kullanıyor?',
		bandApplicability: row(G, G, G),
		setupQuestion: 'S2'
	},
	{
		id: '4.3',
		dimension: 'people',
		text: 'Gölge AI sorgulandı mı?',
		bandApplicability: row(R, R, V),
		restatedText: {
			'1-4': 'Kim hangi işte kişisel hesabını kullanıyor, biliyor musun?',
			'5-15': 'Kim hangi işte kişisel hesabını kullanıyor, biliyor musun?'
		}
	},
	{
		id: '4.4',
		dimension: 'people',
		text: 'Orta kademe teşviki AI öğrenmeyi destekliyor mu?',
		bandApplicability: row(G, G, G),
		setupQuestion: 'S1'
	},
	{
		id: '4.5',
		dimension: 'people',
		text: 'Hatalı çıktı bildirimi güvenli ve tanımlı mı?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '4.6',
		dimension: 'people',
		text: 'Bir kişi ayrılırsa duracak bir AI akışı var mı — başkası anlıyor mu?',
		bandApplicability: row(V, V, V),
		criticalityNote: { '1-4': 'critical', '5-15': 'critical' }
	},

	// --- 5. Süreç ×1 ---
	{
		id: '5.1',
		dimension: 'process',
		text: 'Adımlar tekrarlı/karar/kontrol diye ayrıldı mı?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '5.2',
		dimension: 'process',
		text: 'Darboğaz (işlenme/bekleme) ölçüldü mü?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '5.3',
		dimension: 'process',
		text: 'Otomasyon eşikleri sayısal ve yazılı mı?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '5.4',
		dimension: 'process',
		text: 'Kontrol adımları geri alınabilirlikle orantılı mı?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '5.5',
		dimension: 'process',
		text: 'Standartlaşabilen/değişken süreçler ayrıldı mı?',
		bandApplicability: row(G, G, G),
		setupQuestion: 'S3'
	},

	// --- 6. Yönetişim ×1,5 ---
	{
		id: '6.1',
		dimension: 'governance',
		text: '"Kim karar verir" isimli yazılı mı?',
		bandApplicability: row(N, V, V)
	},
	{
		id: '6.2',
		dimension: 'governance',
		text: 'Kırmızı çizgiler yazılı mı?',
		bandApplicability: row(V, V, V),
		criticalityNote: { '1-4': 'elevated', '5-15': 'elevated' }
	},
	{
		id: '6.3',
		dimension: 'governance',
		text: 'Olay sorumlusu belli mi?',
		bandApplicability: row(N, V, V)
	},
	{
		id: '6.4',
		dimension: 'governance',
		text: 'Risk seviyesi kullanıma göre mi belirleniyor?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '6.5',
		dimension: 'governance',
		text: 'Ajan yetkilerinde "nerede durur" yazılı mı?',
		bandApplicability: row(V, V, V)
	},

	// --- 7. Risk & Uyum ×1,5 ---
	{
		id: '7.1',
		dimension: 'risk',
		text: 'Yedi iç risk değerlendirildi mi?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '7.2',
		dimension: 'risk',
		text: 'Fark edilmeyen hatalı çıktıyı yakalayan yol var mı?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '7.3',
		dimension: 'risk',
		text: "Register'da her satır tür + seviye taşıyor mu?",
		bandApplicability: row(V, V, V)
	},
	{
		id: '7.4',
		dimension: 'risk',
		text: 'KVKK m.11/g itiraz hakkının karşılığı tanımlı mı?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '7.5',
		dimension: 'risk',
		text: 'AB pazarına dokunup dokunmadığın netleşti mi?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '7.6',
		dimension: 'risk',
		text: 'Müşteriye/hastaya dokunan sistemlerde, karşısındakinin yapay zeka olduğu belirtiliyor mu?',
		bandApplicability: row(V, V, V)
	},

	// --- 8. Ölçüm ×1,5 ---
	{
		id: '8.1',
		dimension: 'measurement',
		text: 'Üç katman ayrı mı izleniyor?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '8.2',
		dimension: 'measurement',
		text: 'Yönetime giden rakam iş sonucu mu?',
		bandApplicability: row(N, R, V),
		restatedText: {
			'5-15': 'Kendine bakarken hangi rakama bakıyorsun — kullanım mı, iş sonucu mu?'
		}
	},
	{
		id: '8.3',
		dimension: 'measurement',
		text: 'Yeni projelerde baseline önceden alınıyor mu?',
		bandApplicability: row(V, V, V),
		criticalityNote: { '1-4': 'elevated', '5-15': 'elevated' }
	},
	{
		id: '8.4',
		dimension: 'measurement',
		text: 'ROI sunulurken varsayım yazılıyor mu?',
		bandApplicability: row(V, V, V)
	},
	{
		id: '8.5',
		dimension: 'measurement',
		text: "TCO'ya kontrol adımının insan zamanı dahil mi?",
		bandApplicability: row(V, V, V),
		criticalityNote: { '1-4': 'critical', '5-15': 'critical' }
	}
] as const;

export const SCORECARD_CRITERION_COUNT = 43;

/**
 * Whether a criterion contributes to the scoring denominator for this profile.
 * N/A (band or setup=no) is a visible beyan, not silently dropped from the catalog —
 * but it is excluded from the percentage denominator (§1b, §6).
 */
export function isCriterionInDenominator(
	criterion: ScorecardCriterion,
	band: ScorecardBandId,
	setup: SetupAnswers
): boolean {
	const kind = criterion.bandApplicability[band];
	if (kind === 'na') return false;
	if (kind === 'valid' || kind === 'restated') return true;
	// setupGated
	const q = criterion.setupQuestion;
	if (!q) return false;
	return setup[q] === true;
}

/** Display text for a band (restated overrides when present). */
export function criterionDisplayText(
	criterion: ScorecardCriterion,
	band: ScorecardBandId
): string {
	return criterion.restatedText?.[band] ?? criterion.text;
}

export function countApplicableCriteria(
	band: ScorecardBandId,
	setup: SetupAnswers
): number {
	return SCORECARD_CRITERIA.filter((c) => isCriterionInDenominator(c, band, setup)).length;
}

export function getCriterionById(id: string): ScorecardCriterion | undefined {
	return SCORECARD_CRITERIA.find((c) => c.id === id);
}

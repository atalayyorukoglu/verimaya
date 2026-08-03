/** Free AI scorecard content model — source: Ucretsiz-Karne-Sorulari.md (şartname v1). */

export type KarneChoiceScore = 0 | 2 | 4;

export type KarneChoice = {
	id: string;
	label: string;
	score: KarneChoiceScore;
};

export type KarneQuestionId = 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8' | 's9' | 's10';

export type KarneQuestion = {
	id: KarneQuestionId;
	/** Olcek-Profili-Spec criterion id (e.g. "2.4"). */
	criterion: string;
	title: string;
	hint?: string;
	choices: [KarneChoice, KarneChoice, KarneChoice];
	/** Zero-score area as a sentence for the result screen (şartname §5). */
	weakLabel: string;
};

export type IntakeBandId = '1-4' | '5-15' | '16+';
export type IntakeEuId = 'evet' | 'hayir' | 'emin-degilim';

export type IntakeChoice<T extends string = string> = {
	id: T;
	label: string;
};

export type IntakeQuestion<T extends string = string> = {
	id: 'band' | 'eu';
	title: string;
	choices: readonly IntakeChoice<T>[];
};

export const intakeQuestions = [
	{
		id: 'band',
		title: 'Kliniğinizde kaç kişi çalışıyor?',
		choices: [
			{ id: '1-4', label: '1-4' },
			{ id: '5-15', label: '5-15' },
			{ id: '16+', label: '16 ve üzeri' }
		]
	},
	{
		id: 'eu',
		title: 'Hastalarınız arasında İngiltere veya AB ülkelerinde yaşayanlar var mı?',
		choices: [
			{ id: 'evet', label: 'Evet' },
			{ id: 'hayir', label: 'Hayır' },
			{ id: 'emin-degilim', label: 'Emin değilim' }
		]
	}
] as const satisfies readonly [IntakeQuestion<IntakeBandId>, IntakeQuestion<IntakeEuId>];

export const karneQuestions: readonly KarneQuestion[] = [
	{
		id: 's1',
		criterion: '2.4',
		title: 'Bir hastanın bilgisi bugün kaç ayrı yerde duruyor?',
		weakLabel: 'Hasta bilgisi 4 ayrı yerde, hangisinin güncel olduğu belirsiz',
		choices: [
			{ id: 's1-a', label: 'Tek bir sistemde, hepsi orada', score: 4 },
			{ id: 's1-b', label: '2-3 yerde ama hangisinin doğru olduğunu biliyorum', score: 2 },
			{
				id: 's1-c',
				label: 'Saymadım / 4 ve üzeri / bazen hangisi güncel bilmiyoruz',
				score: 0
			}
		]
	},
	{
		id: 's2',
		criterion: '4.6',
		title: 'Şu an bir kişi işten ayrılsa duracak bir işiniz var mı?',
		weakLabel: 'Kritik işler tek kişinin kafasında',
		choices: [
			{ id: 's2-a', label: 'Hayır, her işi en az iki kişi yapabiliyor', score: 4 },
			{ id: 's2-b', label: 'Bir iki konu var ama devredilebilir', score: 2 },
			{ id: 's2-c', label: 'Evet — o iş sadece o kişinin kafasında', score: 0 }
		]
	},
	{
		id: 's3',
		criterion: '4.3',
		title: 'Ekipte kim, hangi işte kendi kişisel yapay zeka hesabını kullanıyor?',
		weakLabel: 'Ekipte kim hangi yapay zekayı kullanıyor bilinmiyor',
		choices: [
			{ id: 's3-a', label: 'Biliyorum, hangi işte kim kullanıyor listem var', score: 4 },
			{ id: 's3-b', label: 'Kabaca biliyorum ama yazılı değil', score: 2 },
			{ id: 's3-c', label: 'Bilmiyorum / hiç sormadım', score: 0 }
		]
	},
	{
		id: 's4',
		criterion: '7.6',
		title:
			'Hastanız sizinle yazışırken, karşısındakinin bir insan değil yapay zeka olduğunu biliyor mu?',
		weakLabel: 'Hasta, yazışırken yapay zekayla konuştuğunu bilmiyor',
		choices: [
			{ id: 's4-a', label: 'Yapay zeka kullanmıyoruz', score: 4 },
			{ id: 's4-b', label: 'Kullanıyoruz ve hastaya açıkça belirtiyoruz', score: 4 },
			{ id: 's4-c', label: 'Kullanıyoruz ama hasta bilmiyor / emin değilim', score: 0 }
		]
	},
	{
		id: 's5',
		criterion: '3.5',
		title:
			'Yarın kullandığınız programı bırakmak isteseniz, hasta kayıtlarınızın tamamını dışarı alabilir misiniz?',
		weakLabel: 'Sistemden veri çıkışını hiç denemediniz',
		choices: [
			{ id: 's5-a', label: 'Evet, denedim, çalışıyor', score: 4 },
			{ id: 's5-b', label: 'Sanırım alabiliriz ama hiç denemedik', score: 2 },
			{ id: 's5-c', label: 'Bilmiyorum / alamayız', score: 0 }
		]
	},
	{
		id: 's6',
		criterion: '3.1',
		title:
			'Kullandığınız programların hasta bilgisini nerede sakladığını yazılı olarak biliyor musunuz?',
		weakLabel: 'Hasta verisinin nerede saklandığı yazılı değil',
		choices: [
			{ id: 's6-a', label: 'Evet, sözleşmede/yazıda var', score: 4 },
			{ id: 's6-b', label: 'Sözlü söylediler', score: 2 },
			{ id: 's6-c', label: 'Hiç sormadım', score: 0 }
		]
	},
	{
		id: 's7',
		criterion: '6.2',
		title: 'Yapay zekanın kliniğinizde kesinlikle yapmaması gereken şeyler yazılı mı?',
		hint: '"fiyat teklifi göndermesin", "tıbbi tavsiye vermesin", "hasta fotoğrafı işlemesin"',
		weakLabel: 'Yapay zekanın yapmaması gerekenler yazılı değil',
		choices: [
			{ id: 's7-a', label: 'Evet, yazılı ve ekip biliyor', score: 4 },
			{ id: 's7-b', label: 'Kafamızda var ama yazılı değil', score: 2 },
			{ id: 's7-c', label: 'Böyle bir şey düşünmedik', score: 0 }
		]
	},
	{
		id: 's8',
		criterion: '7.4',
		title: 'Bir hasta "benim hakkımdaki bu kararı makine mi verdi" diye sorsa ne yapardınız?',
		weakLabel: 'Hasta "kararı makine mi verdi" diye sorsa tanımlı cevap yok',
		choices: [
			{ id: 's8-a', label: 'Cevap verecek bir sürecimiz var', score: 4 },
			{ id: 's8-b', label: 'Cevap veririz ama tanımlı bir yolu yok', score: 2 },
			{
				id: 's8-c',
				label: 'Bu soruyla hiç karşılaşmadım / ne diyeceğimi bilmiyorum',
				score: 0
			}
		]
	},
	{
		id: 's9',
		criterion: '8.3',
		title: 'Yapay zekayı kullanmaya başlamadan önce, işlerin ne kadar sürdüğünü ölçmüş müydünüz?',
		weakLabel: 'Yapay zeka öncesi iş süreleri ölçülmemiş',
		choices: [
			{ id: 's9-a', label: 'Evet, öncesi elimizde', score: 4 },
			{ id: 's9-b', label: 'Kabaca hatırlıyoruz', score: 2 },
			{ id: 's9-c', label: 'Hayır, ölçmedik', score: 0 }
		]
	},
	{
		id: 's10',
		criterion: '8.5',
		title: 'Yapay zekanın ürettiğini kontrol etmek ayda kaç saatinizi alıyor?',
		weakLabel: 'Yapay zeka kontrolüne giden saatler hesaplanmamış',
		choices: [
			{ id: 's10-a', label: 'Hesapladım, biliyorum', score: 4 },
			{ id: 's10-b', label: 'Az bir şey herhalde', score: 2 },
			{ id: 's10-c', label: 'Hiç düşünmemiştim', score: 0 }
		]
	}
];

export const KARNE_CRITERIA = [
	'2.4',
	'4.6',
	'4.3',
	'7.6',
	'3.5',
	'3.1',
	'6.2',
	'7.4',
	'8.3',
	'8.5'
] as const;

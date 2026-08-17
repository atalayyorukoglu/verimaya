import type { MessageKey } from '$lib/i18n/messages';

/**
 * Ekran içi yardım (ⓘ) içerik kaydı.
 *
 * Metin `messages.ts`'te (tr + en); burada yalnız hangi anahtarların hangi ekrana ait
 * olduğu durur. Sayfalar `<PageHeader helpTopic="..." />` yazar, içerik tek yerden yönetilir.
 *
 * Her konu üç parçadan oluşur — sıra bilinçli:
 *   1. `body`  — bu ekran ne işe yarar, hangi soruyu cevaplar
 *   2. `example` — TEK somut örnek; soyut açıklamayı yere indirir
 *   3. `caveat` — (opsiyonel) yanlış okumaya açık nokta; yoksa yazılmaz
 */
export type HelpTopic =
	| 'untouched-contacts'
	| 'incentives'
	| 'commissions'
	| 'cohorts'
	| 'knowledge'
	| 'maya'
	| 'operation-alerts';

export type HelpContent = {
	titleKey: MessageKey;
	bodyKeys: MessageKey[];
	exampleKey: MessageKey;
	caveatKey?: MessageKey;
};

export const helpContent: Record<HelpTopic, HelpContent> = {
	'untouched-contacts': {
		titleKey: 'help.untouched.title',
		bodyKeys: ['help.untouched.b1', 'help.untouched.b2'],
		exampleKey: 'help.untouched.example',
		caveatKey: 'help.untouched.caveat'
	},
	incentives: {
		titleKey: 'help.incentives.title',
		bodyKeys: ['help.incentives.b1', 'help.incentives.b2'],
		exampleKey: 'help.incentives.example',
		caveatKey: 'help.incentives.caveat'
	},
	'operation-alerts': {
		titleKey: 'help.operation-alerts.title',
		bodyKeys: ['help.operation-alerts.b1', 'help.operation-alerts.b2'],
		exampleKey: 'help.operation-alerts.example',
		caveatKey: 'help.operation-alerts.caveat'
	},
	commissions: {
		titleKey: 'help.commissions.title',
		bodyKeys: ['help.commissions.b1', 'help.commissions.b2'],
		exampleKey: 'help.commissions.example',
		caveatKey: 'help.commissions.caveat'
	},
	maya: {
		titleKey: 'help.maya.title',
		bodyKeys: ['help.maya.b1', 'help.maya.b2'],
		exampleKey: 'help.maya.example',
		caveatKey: 'help.maya.caveat'
	},
	knowledge: {
		titleKey: 'help.knowledge.title',
		bodyKeys: ['help.knowledge.b1', 'help.knowledge.b2'],
		exampleKey: 'help.knowledge.example',
		caveatKey: 'help.knowledge.caveat'
	},
	cohorts: {
		titleKey: 'help.cohorts.title',
		bodyKeys: ['help.cohorts.b1', 'help.cohorts.b2'],
		exampleKey: 'help.cohorts.example',
		caveatKey: 'help.cohorts.caveat'
	}
};

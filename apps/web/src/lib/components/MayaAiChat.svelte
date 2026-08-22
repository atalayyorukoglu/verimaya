<script lang="ts">
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import { apiPaths, type MayaAnswer } from '@verimaya/shared';
	import { apiSend } from '$lib/api';
	import { mayaToolAnswerText, mayaToolLabel } from '$lib/maya-tool-answer';
	import { cn } from '$lib/utils';
	import Send from '@lucide/svelte/icons/send';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';

	let {
		variant = 'page',
		onRequestClose
	}: {
		variant?: 'page' | 'drawer';
		onRequestClose?: () => void;
	} = $props();

	type Citation = { labelKey: MessageKey; href: string };

	type ChatMessage = {
		id: string;
		role: 'user' | 'assistant';
		text: string;
		citations?: Citation[];
		showDraftAction?: boolean;
		/** AI-11a: hangi aracın kullanıldığı kullanıcıya görünür. */
		toolLabel?: string;
	};

	// AI-11a: örnek sorular artık gerçek araçların cevapladığı sorular.
	const suggestionKeys = [
		'maya.suggestion.openBalances',
		'maya.suggestion.periodSummary',
		'maya.suggestion.untouched'
	] as const satisfies readonly MessageKey[];

	let messages = $state<ChatMessage[]>([
		{
			id: 'welcome',
			role: 'assistant',
			text: t('maya.welcome')
		}
	]);
	let input = $state('');
	let thinking = $state(false);
	let draftApproved = $state(false);
	let scrollEl = $state<HTMLDivElement | undefined>(undefined);
	let idSeq = 0;

	const isDrawer = $derived(variant === 'drawer');
	const canSend = $derived(input.trim().length > 0 && !thinking);

	$effect(() => {
		void messages.length;
		void thinking;
		const el = scrollEl;
		if (!el) return;
		void tick().then(() => {
			el.scrollTop = el.scrollHeight;
		});
	});

	function nextId(prefix: string): string {
		idSeq += 1;
		return `${prefix}-${idSeq}`;
	}

	/**
	 * Gerçek uç: `POST /v1/maya/ask`. İki cevap yolu var, ikisinde de uydurma yok:
	 * - `source: 'tool'` → canlı veri. Rakamlar `tool_result` içinde, Postgres'ten
	 *   gelir; cümleyi burada `messages.ts` şablonundan kuruyoruz. `answer` boştur —
	 *   modelin yazdığı bir metin hiçbir zaman ekrana basılmaz.
	 * - `source: 'knowledge'` → bilgi bankası cevabı (AI-01 davranışı).
	 * Sunucu bilmiyorsa `grounded: false` döner ve "bilmiyorum" metnini gösteririz.
	 */
	async function sendPrompt(prompt: string) {
		const trimmed = prompt.trim();
		if (!trimmed || thinking) return;

		messages.push({ id: nextId('u'), role: 'user', text: trimmed });
		input = '';
		thinking = true;

		try {
			const res = await apiSend<MayaAnswer>(apiPaths.mayaAsk, 'POST', { question: trimmed });
			messages.push({ id: nextId('a'), role: 'assistant', ...renderAnswer(res) });
		} catch {
			messages.push({ id: nextId('a'), role: 'assistant', text: t('maya.error') });
		} finally {
			thinking = false;
		}
	}

	function renderAnswer(res: MayaAnswer): { text: string; toolLabel?: string } {
		if (res.source === 'tool' && res.tool && res.tool_result) {
			return { text: mayaToolAnswerText(res.tool_result), toolLabel: mayaToolLabel(res.tool) };
		}
		if (res.knowledge_empty) return { text: t('maya.knowledgeEmpty') };
		if (res.grounded) return { text: res.answer };
		return { text: t('maya.unknown') };
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			void sendPrompt(input);
		}
	}

	function approveDraft() {
		draftApproved = true;
	}
</script>

<div class={cn('flex h-full min-h-0 flex-col bg-surface', isDrawer && 'text-sm')}>
	<header
		class={cn(
			'flex shrink-0 items-center gap-2 border-b border-border',
			isDrawer ? 'px-3 py-2.5' : 'px-4 py-3'
		)}
	>
		<div
			class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-brand"
			aria-hidden="true"
		>
			{#if isDrawer}
				<Sparkles class="size-4" />
			{:else}
				<BrandMark class="size-4" title="" />
			{/if}
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<h2 class={cn('font-semibold text-text', isDrawer ? 'text-sm' : 'text-base')}>
					{t('maya.title')}
				</h2>
			</div>
			{#if !isDrawer}
				<p class="mt-0.5 text-xs text-text-muted">{t('maya.subtitle')}</p>
			{/if}
		</div>
		{#if isDrawer}
			<a
				href="/maya"
				class="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
				onclick={() => onRequestClose?.()}
			>
				{t('maya.openFull')}
			</a>
			{#if onRequestClose}
				<Button
					variant="ghost"
					size="icon"
					class="shrink-0"
					onclick={onRequestClose}
					aria-label={t('maya.close')}
				>
					<X class="size-4" />
				</Button>
			{/if}
		{/if}
	</header>

	<div bind:this={scrollEl} class="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4">
		{#each messages as message (message.id)}
			<div class={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
				<div
					class={cn(
						'max-w-[85%] rounded-lg px-3 py-2',
						message.role === 'user'
							? 'bg-brand text-primary-foreground'
							: 'border border-border bg-surface-2 text-text'
					)}
				>
					<p class="break-words whitespace-pre-wrap">{message.text}</p>

					{#if message.toolLabel}
						<p class="mt-2 border-t border-border/60 pt-2 text-xs text-text-faint">
							{t('maya.tool.badge', { tool: message.toolLabel })}
						</p>
					{/if}

					{#if message.citations?.length}
						<ul class="mt-2 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
							{#each message.citations as cite (cite.href + cite.labelKey)}
								<li>
									<a
										href={cite.href}
										class="inline-flex items-center rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-text-muted transition-colors hover:bg-bg hover:text-text"
									>
										{t(cite.labelKey)}
									</a>
								</li>
							{/each}
						</ul>
					{/if}

					{#if message.showDraftAction}
						<div class="mt-2 space-y-2 border-t border-border/60 pt-2">
							<p class="text-xs text-text-faint">{t('maya.draftHint')}</p>
							<Button
								variant={draftApproved ? 'secondary' : 'default'}
								size="sm"
								disabled={draftApproved}
								onclick={approveDraft}
							>
								{draftApproved ? t('maya.draftApproved') : t('maya.approveDraft')}
							</Button>
						</div>
					{/if}
				</div>
			</div>
		{/each}

		{#if thinking}
			<div class="flex justify-start">
				<div
					class="rounded-lg border border-border bg-surface-2 px-3 py-2 text-text-muted"
					aria-live="polite"
				>
					<span class="inline-flex items-center gap-2">
						<Sparkles class="size-3.5 animate-pulse text-brand" />
						{t('maya.thinking')}
					</span>
				</div>
			</div>
		{/if}
	</div>

	<div class={cn('shrink-0 border-t border-border', isDrawer ? 'p-2.5' : 'p-3 sm:p-4')}>
		<div class="mb-2 flex flex-wrap gap-1.5">
			{#each suggestionKeys as key (key)}
				<button
					type="button"
					class="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text-muted transition-colors hover:border-brand/40 hover:bg-brand-subtle hover:text-brand-text disabled:opacity-50"
					disabled={thinking}
					onclick={() => void sendPrompt(t(key))}
				>
					{t(key)}
				</button>
			{/each}
		</div>

		<div class="flex items-end gap-2">
			<textarea
				bind:value={input}
				rows={isDrawer ? 2 : 3}
				class="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-faint focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				placeholder={t('maya.placeholder')}
				disabled={thinking}
				onkeydown={handleKeydown}></textarea>
			<Button
				size={isDrawer ? 'sm' : 'default'}
				class="shrink-0"
				disabled={!canSend}
				onclick={() => void sendPrompt(input)}
				aria-label={t('maya.send')}
			>
				<Send class="size-4" />
				<span class="hidden sm:inline">{t('maya.send')}</span>
			</Button>
		</div>
	</div>
</div>

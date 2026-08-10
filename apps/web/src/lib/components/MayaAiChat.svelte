<script lang="ts">
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
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
	};

	const suggestionKeys = [
		'maya.suggestion.tomorrow',
		'maya.suggestion.summary',
		'maya.suggestion.missingSource',
		'maya.suggestion.stale'
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

	function matchReply(prompt: string): Omit<ChatMessage, 'id' | 'role'> {
		const lower = prompt.toLowerCase();
		if (/randevu|tomorrow|yarın|yarin/.test(lower)) {
			return {
				text: t('maya.response.tomorrow'),
				citations: [{ labelKey: 'maya.cite.appointments', href: '/appointments' }]
			};
		}
		if (/özet|ozet|summary|ayşe|ayse|kaya/.test(lower)) {
			return {
				text: t('maya.response.summary'),
				citations: [{ labelKey: 'maya.cite.contact', href: '/contacts' }]
			};
		}
		if (/kaynak|source/.test(lower)) {
			return {
				text: t('maya.response.missingSource'),
				citations: [{ labelKey: 'maya.cite.dataQuality', href: '/settings/data-quality' }],
				showDraftAction: true
			};
		}
		if (/sessiz|stale|takip/.test(lower)) {
			return {
				text: t('maya.response.stale'),
				citations: [{ labelKey: 'maya.cite.contact', href: '/contacts' }],
				showDraftAction: true
			};
		}
		return { text: t('maya.response.default') };
	}

	function sendPrompt(prompt: string) {
		const trimmed = prompt.trim();
		if (!trimmed || thinking) return;

		messages.push({ id: nextId('u'), role: 'user', text: trimmed });
		input = '';
		thinking = true;

		const reply = matchReply(trimmed);
		window.setTimeout(() => {
			messages.push({ id: nextId('a'), role: 'assistant', ...reply });
			thinking = false;
		}, 600);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendPrompt(input);
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
				<span
					class="rounded-md bg-brand-subtle px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-brand-text uppercase"
				>
					{t('maya.mockBadge')}
				</span>
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
			<div
				class={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
			>
				<div
					class={cn(
						'max-w-[85%] rounded-lg px-3 py-2',
						message.role === 'user'
							? 'bg-brand text-primary-foreground'
							: 'border border-border bg-surface-2 text-text'
					)}
				>
					<p class="whitespace-pre-wrap break-words">{message.text}</p>

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
					onclick={() => sendPrompt(t(key))}
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
				onkeydown={handleKeydown}
			></textarea>
			<Button
				size={isDrawer ? 'sm' : 'default'}
				class="shrink-0"
				disabled={!canSend}
				onclick={() => sendPrompt(input)}
				aria-label={t('maya.send')}
			>
				<Send class="size-4" />
				<span class="hidden sm:inline">{t('maya.send')}</span>
			</Button>
		</div>
	</div>
</div>

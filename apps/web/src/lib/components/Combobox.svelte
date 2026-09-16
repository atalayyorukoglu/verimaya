<script lang="ts" module>
	export type ComboboxOption = {
		value: string;
		label: string;
		description?: string;
	};
</script>

<script lang="ts">
	import { fieldClass } from '$lib/api';
	import { onDestroy } from 'svelte';

	let {
		id,
		value = $bindable(''),
		options,
		placeholder,
		emptyText,
		clearLabel,
		disabled = false,
		inputClass = fieldClass,
		onsearch,
		selectedLabel = null,
		searchingText = null,
		onselect
	}: {
		id: string;
		value?: string;
		options: ComboboxOption[];
		placeholder: string;
		emptyText: string;
		clearLabel: string;
		disabled?: boolean;
		/** Override default fieldClass (e.g. mobile 44px / 16px). */
		inputClass?: string;
		/**
		 * Sunucu taraflı arama. Verildiğinde en az `MIN_CHARS` harf yazıldıktan
		 * `DEBOUNCE_MS` sonra çağrılır ve liste dönen sonuçlardan kurulur.
		 *
		 * Neden: `options` çağıranın önceden yüklediği ilk sayfadır (100 kayıt).
		 * 1000+ kişili kiracıda aranan kişi o sayfada olmadığı için "hasta
		 * bulunamıyor" oluyordu; artık harfler sunucuya gidiyor.
		 */
		onsearch?: (query: string) => Promise<ComboboxOption[]>;
		/**
		 * Seçili değerin etiketi. Sunucu aramasında seçili kayıt listede olmayabilir
		 * (arama sonucu değişince listeden düşer); etiket buradan okunur ki kutu
		 * boşalmasın.
		 */
		selectedLabel?: string | null;
		searchingText?: string | null;
		onselect?: (option: ComboboxOption | null) => void;
	} = $props();

	const MIN_CHARS = 2;
	const DEBOUNCE_MS = 250;

	let open = $state(false);
	let activeIndex = $state(0);
	let query = $state('');
	let editing = $state(false);
	let remoteOptions = $state<ComboboxOption[]>([]);
	let searching = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;
	/** Yarışan istekler: yalnız en son aramanın sonucu yazılır. */
	let searchSeq = 0;

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	const selectedOption = $derived(
		options.find((option) => option.value === value) ??
			remoteOptions.find((option) => option.value === value) ??
			(value && selectedLabel ? { value, label: selectedLabel } : null)
	);
	const inputValue = $derived(editing ? query : (selectedOption?.label ?? ''));
	const normalizedQuery = $derived(inputValue.trim().toLocaleLowerCase());
	const remoteMode = $derived(Boolean(onsearch) && normalizedQuery.length >= MIN_CHARS);
	const filteredOptions = $derived.by(() => {
		if (remoteMode) return remoteOptions;
		if (!normalizedQuery || inputValue === selectedOption?.label) return options;
		return options.filter((option) =>
			`${option.label} ${option.description ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
		);
	});
	const listboxId = $derived(`${id}-listbox`);

	function optionId(option: ComboboxOption): string {
		return `${id}-option-${option.value}`;
	}

	function scheduleSearch(raw: string) {
		if (!onsearch) return;
		if (timer) clearTimeout(timer);
		const term = raw.trim();
		if (term.length < MIN_CHARS) {
			searching = false;
			remoteOptions = [];
			return;
		}
		searching = true;
		timer = setTimeout(() => {
			const seq = ++searchSeq;
			void onsearch(term)
				.then((found) => {
					if (seq !== searchSeq) return;
					remoteOptions = found;
				})
				.catch(() => {
					if (seq !== searchSeq) return;
					remoteOptions = [];
				})
				.finally(() => {
					if (seq === searchSeq) searching = false;
				});
		}, DEBOUNCE_MS);
	}

	function showOptions() {
		if (disabled) return;
		editing = true;
		query = selectedOption?.label ?? query;
		open = true;
		activeIndex = Math.max(
			0,
			filteredOptions.findIndex((option) => option.value === value)
		);
	}

	function handleInput(event: Event) {
		if (!(event.currentTarget instanceof HTMLInputElement)) return;
		editing = true;
		query = event.currentTarget.value;
		if (selectedOption && query !== selectedOption.label) {
			value = '';
			onselect?.(null);
		}
		open = true;
		activeIndex = 0;
		scheduleSearch(query);
	}

	function choose(option: ComboboxOption | null) {
		if (timer) clearTimeout(timer);
		searching = false;
		value = option?.value ?? '';
		query = option?.label ?? '';
		editing = false;
		open = false;
		onselect?.(option);
		const inputElement = document.getElementById(id);
		if (inputElement instanceof HTMLInputElement) inputElement.focus();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (!open) return;
			event.preventDefault();
			open = false;
			editing = false;
			query = selectedOption?.label ?? '';
			return;
		}

		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!open) {
				showOptions();
				return;
			}
			if (filteredOptions.length === 0) return;
			const direction = event.key === 'ArrowDown' ? 1 : -1;
			activeIndex = (activeIndex + direction + filteredOptions.length) % filteredOptions.length;
			return;
		}

		if (event.key === 'Enter' && open && filteredOptions[activeIndex]) {
			event.preventDefault();
			choose(filteredOptions[activeIndex]);
		}
	}

	function handleFocusOut(event: FocusEvent) {
		const rootElement = event.currentTarget;
		if (
			rootElement instanceof HTMLDivElement &&
			event.relatedTarget instanceof Node &&
			rootElement.contains(event.relatedTarget)
		) {
			return;
		}
		open = false;
		editing = false;
		query = selectedOption?.label ?? '';
	}
</script>

<div class="relative min-w-0" onfocusout={handleFocusOut}>
	<input
		{id}
		type="text"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={open}
		aria-controls={listboxId}
		aria-activedescendant={open && filteredOptions[activeIndex]
			? optionId(filteredOptions[activeIndex])
			: undefined}
		autocomplete="off"
		class="{inputClass} min-w-0"
		{placeholder}
		{disabled}
		aria-busy={searching}
		value={inputValue}
		onfocus={(event) => {
			showOptions();
			event.currentTarget.select();
		}}
		oninput={handleInput}
		onkeydown={handleKeydown}
	/>

	{#if open}
		<div
			id={listboxId}
			role="listbox"
			class="mt-1 max-h-60 w-full min-w-0 overflow-y-auto rounded-[6px] border border-border bg-surface p-1"
		>
			<button
				type="button"
				tabindex="-1"
				id={`${id}-option-clear`}
				role="option"
				aria-selected={!value}
				class="block w-full rounded-[4px] px-3 py-2 text-left text-sm text-text-muted hover:bg-surface-2"
				onpointerdown={(event) => event.preventDefault()}
				onclick={() => choose(null)}
			>
				{clearLabel}
			</button>
			{#each filteredOptions as option, index (option.value)}
				<button
					type="button"
					tabindex="-1"
					id={optionId(option)}
					role="option"
					aria-selected={option.value === value}
					class={[
						'block w-full min-w-0 rounded-[4px] px-3 py-2 text-left text-sm text-text',
						index === activeIndex && 'bg-surface-2'
					]}
					onpointerdown={(event) => event.preventDefault()}
					onpointerenter={() => (activeIndex = index)}
					onclick={() => choose(option)}
				>
					<span class="block truncate">{option.label}</span>
					{#if option.description}
						<span class="block truncate text-xs text-text-faint">{option.description}</span>
					{/if}
				</button>
			{:else}
				<div class="px-3 py-3 text-sm text-text-muted" aria-live="polite">
					{searching && searchingText ? searchingText : emptyText}
				</div>
			{/each}
		</div>
	{/if}
</div>

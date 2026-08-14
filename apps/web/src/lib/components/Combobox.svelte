<script lang="ts">
	import { fieldClass } from '$lib/api';

	type ComboboxOption = {
		value: string;
		label: string;
		description?: string;
	};

	let {
		id,
		value = $bindable(''),
		options,
		placeholder,
		emptyText,
		clearLabel,
		disabled = false,
		inputClass = fieldClass,
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
		onselect?: (option: ComboboxOption | null) => void;
	} = $props();

	let open = $state(false);
	let activeIndex = $state(0);
	let query = $state('');
	let editing = $state(false);

	const selectedOption = $derived(options.find((option) => option.value === value) ?? null);
	const inputValue = $derived(editing ? query : (selectedOption?.label ?? ''));
	const normalizedQuery = $derived(inputValue.trim().toLocaleLowerCase());
	const filteredOptions = $derived.by(() => {
		if (!normalizedQuery || inputValue === selectedOption?.label) return options;
		return options.filter((option) =>
			`${option.label} ${option.description ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
		);
	});
	const listboxId = $derived(`${id}-listbox`);

	function optionId(option: ComboboxOption): string {
		return `${id}-option-${option.value}`;
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
	}

	function choose(option: ComboboxOption | null) {
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
				<div class="px-3 py-3 text-sm text-text-muted" aria-live="polite">{emptyText}</div>
			{/each}
		</div>
	{/if}
</div>

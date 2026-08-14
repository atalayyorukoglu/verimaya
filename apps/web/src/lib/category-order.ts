import type { FinanceCategory } from '@verimaya/shared';

type CategoryKind = FinanceCategory['kind'];
type MoveDirection = -1 | 1;

function orderedKindItems(items: FinanceCategory[], kind: CategoryKind): FinanceCategory[] {
	return items.filter((item) => item.kind === kind).toSorted((a, b) => a.sort_order - b.sort_order);
}

export function moveCategoryWithinKind(
	items: FinanceCategory[],
	categoryId: string,
	direction: MoveDirection
): FinanceCategory[] | null {
	const category = items.find((item) => item.id === categoryId);
	if (!category) return null;

	const ordered = orderedKindItems(items, category.kind);
	const currentIndex = ordered.findIndex((item) => item.id === categoryId);
	const targetIndex = currentIndex + direction;
	if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return null;

	[ordered[currentIndex], ordered[targetIndex]] = [ordered[targetIndex]!, ordered[currentIndex]!];
	const sortOrderById = new Map(ordered.map((item, index) => [item.id, index]));

	return items.map((item) => {
		if (item.kind !== category.kind) return item;
		return { ...item, sort_order: sortOrderById.get(item.id)! };
	});
}

export function toCategoryReorderItems(items: FinanceCategory[]) {
	return items.map((item) => ({ id: item.id, sort_order: item.sort_order }));
}

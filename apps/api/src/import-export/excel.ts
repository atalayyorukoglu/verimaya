import ExcelJS from 'exceljs';

const FORMULA_PREFIXES = ['=', '+', '-', '@'] as const;

/**
 * Prevent Excel formula injection on export (Tracker `_sanitize_cell`).
 * Cells starting with = + - @ get a leading apostrophe so Excel treats them as text.
 */
export function sanitizeCell(value: unknown): string | number | boolean | Date | null {
	if (value == null) return null;
	if (typeof value === 'number' || typeof value === 'boolean') return value;
	if (value instanceof Date) return value;
	const s = String(value);
	if (FORMULA_PREFIXES.some((p) => s.startsWith(p))) {
		return `'${s}`;
	}
	return s;
}

export function sanitizeRow(values: unknown[]): Array<string | number | boolean | Date | null> {
	return values.map(sanitizeCell);
}

export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
	const buf = await wb.xlsx.writeBuffer();
	return Buffer.from(buf);
}

export async function loadWorkbook(data: Buffer): Promise<ExcelJS.Workbook> {
	const wb = new ExcelJS.Workbook();
	// exceljs typings expect Buffer; Node 22 Buffer generics disagree — cast is local.
	await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
	return wb;
}

export function cellToString(value: ExcelJS.CellValue): string {
	if (value == null || value === '') return '';
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'object') {
		if ('text' in value && typeof value.text === 'string') return value.text.trim();
		if ('result' in value && value.result != null)
			return cellToString(value.result as ExcelJS.CellValue);
		if ('richText' in value && Array.isArray(value.richText)) {
			return value.richText
				.map((p) => p.text)
				.join('')
				.trim();
		}
	}
	return String(value).trim();
}

export function sheetToObjects(
	ws: ExcelJS.Worksheet,
	canonicalHeaders: readonly string[],
	aliases: Record<string, string>
): { headers: string[]; rows: Array<Record<string, string>> } {
	const headerRow = ws.getRow(1);
	const colMap = new Map<number, string>();
	const allowed = new Set(canonicalHeaders.map((h) => h.toLowerCase()));

	headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
		const raw = cellToString(cell.value).toLowerCase();
		if (!raw) return;
		const canonical = aliases[raw] ?? (allowed.has(raw) ? raw : null);
		if (canonical) colMap.set(colNumber, canonical);
		// unknown columns intentionally ignored
	});

	const headers = [...new Set(colMap.values())];
	const rows: Array<Record<string, string>> = [];

	ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
		if (rowNumber === 1) return;
		const obj: Record<string, string> = {};
		let any = false;
		for (const [col, key] of colMap) {
			const v = cellToString(row.getCell(col).value);
			if (v) {
				obj[key] = v;
				any = true;
			}
		}
		if (any) rows.push(obj);
	});

	return { headers, rows };
}

export function createHeaderSheet(
	wb: ExcelJS.Workbook,
	sheetName: string,
	headers: readonly string[]
): ExcelJS.Worksheet {
	const ws = wb.addWorksheet(sheetName);
	ws.addRow([...headers]);
	ws.views = [{ state: 'frozen', ySplit: 1 }];
	headers.forEach((h, i) => {
		ws.getColumn(i + 1).width = Math.max(12, Math.min(28, h.length + 2));
	});
	return ws;
}

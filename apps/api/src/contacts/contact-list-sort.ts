import { sql, type SQL } from 'drizzle-orm';
import { CONTACT_INSTITUTION_TYPE_NAMES } from '@verimaya/shared';
import { contacts } from '../db/schema';

const institutionTypesSql = sql.join(
	CONTACT_INSTITUTION_TYPE_NAMES.map((name) => sql`${name}`),
	sql`, `
);

/** Unaliased — use in WHERE / ORDER BY (SELECT aliases are invalid there). */
export function contactSortLastNameSql(table: typeof contacts = contacts): SQL<string | null> {
	return sql<string | null>`
		COALESCE(
			NULLIF(btrim(${table.lastName}), ''),
			CASE
				WHEN ${table.contactTypeName} IN (${institutionTypesSql}) THEN NULL
				WHEN position(' ' in btrim(${table.displayName})) = 0 THEN NULL
				ELSE NULLIF(
					btrim(
						substr(
							btrim(${table.displayName}),
							char_length(split_part(btrim(${table.displayName}), ' ', 1)) + 1
						)
					),
					''
				)
			END
		)
	`;
}

/** Mirrors `contactListSortKeys` in packages/shared — keep in sync. */
export function contactSortLastNameExpr(table: typeof contacts = contacts): SQL.Aliased<
	string | null
> {
	return contactSortLastNameSql(table).as('sort_last_name');
}

export function contactSortFirstNameSql(table: typeof contacts = contacts): SQL<string | null> {
	return sql<string | null>`
		CASE
			WHEN ${table.contactTypeName} IN (${institutionTypesSql}) THEN btrim(${table.displayName})
			WHEN NULLIF(btrim(${table.lastName}), '') IS NOT NULL THEN COALESCE(
				NULLIF(btrim(${table.firstName}), ''),
				NULLIF(split_part(btrim(${table.displayName}), ' ', 1), ''),
				btrim(${table.displayName})
			)
			ELSE split_part(btrim(${table.displayName}), ' ', 1)
		END
	`;
}

export function contactSortFirstNameExpr(table: typeof contacts = contacts): SQL.Aliased<
	string | null
> {
	return contactSortFirstNameSql(table).as('sort_first_name');
}

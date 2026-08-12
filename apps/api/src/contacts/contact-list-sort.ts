import { sql, type SQL } from 'drizzle-orm';
import { CONTACT_INSTITUTION_TYPE_NAMES } from '@verimaya/shared';
import { contacts } from '../db/schema';

const institutionTypesSql = sql.join(
	CONTACT_INSTITUTION_TYPE_NAMES.map((name) => sql`${name}`),
	sql`, `
);

/** Mirrors `contactListSortKeys` in packages/shared — keep in sync. */
export function contactSortLastNameExpr(table: typeof contacts = contacts): SQL.Aliased<
	string | null
> {
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
	`.as('sort_last_name');
}

export function contactSortFirstNameExpr(table: typeof contacts = contacts): SQL.Aliased<string> {
	return sql<string>`
		CASE
			WHEN ${table.contactTypeName} IN (${institutionTypesSql}) THEN btrim(${table.displayName})
			WHEN NULLIF(btrim(${table.lastName}), '') IS NOT NULL THEN btrim(${table.firstName})
			ELSE split_part(btrim(${table.displayName}), ' ', 1)
		END
	`.as('sort_first_name');
}

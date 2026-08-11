#!/usr/bin/env node
/**
 * Ops: set/reset a user's email+password credential (better-auth hash).
 *
 * Coolify API container:
 *   node scripts/set-user-password.js --email you@example.com --password 'NewPass123!'
 *
 * Uses DATABASE_URL (owner or app). Does not create organizations.
 */
import postgres from "postgres";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

const email = (arg("--email") ?? "").trim().toLowerCase();
const password = arg("--password") ?? "";

if (!email || !password || password.length < 8) {
  console.error(
    "Usage: node scripts/set-user-password.js --email you@example.com --password 'AtLeast8chars'",
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_APP;
if (!databaseUrl) {
  console.error("DATABASE_URL or DATABASE_URL_APP required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const hash = await hashPassword(password);
  const users =
    await sql`select id, email, name from "user" where lower(email) = ${email} limit 1`;
  let userId;
  if (users[0]) {
    userId = users[0].id;
    console.log(`Found user ${userId} (${users[0].email})`);
  } else {
    userId = randomUUID();
    const name = email.split("@")[0] || "User";
    await sql`
			insert into "user" (id, name, email, email_verified, created_at, updated_at)
			values (${userId}, ${name}, ${email}, true, now(), now())
		`;
    console.log(`Created user ${userId}`);
  }

  const accounts = await sql`
		select id from account
		where user_id = ${userId}::uuid and provider_id = 'credential'
		limit 1
	`;
  if (accounts[0]) {
    await sql`
			update account
			set password = ${hash}, updated_at = now()
			where id = ${accounts[0].id}::uuid
		`;
    console.log("Updated credential password");
  } else {
    await sql`
			insert into account (
				id, account_id, provider_id, user_id, password, created_at, updated_at
			) values (
				${randomUUID()}, ${userId}, 'credential', ${userId}::uuid, ${hash}, now(), now()
			)
		`;
    console.log("Created credential account");
  }

  console.log("Done. Sign in at https://app.verimaya.com/login");
} finally {
  await sql.end({ timeout: 5 });
}

import "../api/lib/env";
import { getSql } from "../api/queries/connection";

const sql = getSql();

const missing = await sql`
  select c.relname as name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in ('indicator_registry', 'intelligence_watchlist', 'scheduled_tasks', 'users', 'broker_accounts', 'autonomous_sessions')
  order by 1
`;
console.log("present:", missing.map((r) => r.name).join(", ") || "(none)");

const usersCols = await sql`
  select data_type from information_schema.columns
  where table_schema='public' and table_name='users' and column_name='id'
`;
console.log("users.id type:", usersCols[0]?.data_type ?? "NO users TABLE");

await sql.end({ timeout: 2 });

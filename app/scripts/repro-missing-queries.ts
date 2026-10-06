import "../api/lib/env";
import { getSql } from "../api/queries/connection";

const sql = getSql();

async function tryQ(label: string, fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    console.log(label, "OK", Array.isArray(r) ? `rows=${r.length}` : r);
  } catch (e) {
    console.log(label, "FAIL", (e as Error).message.slice(0, 200));
  }
}

await tryQ("indicator_registry", () =>
  sql`select id from indicator_registry where "indicatorId" = ${"sma_5"} limit 1`,
);
await tryQ("intelligence_watchlist", () => sql`select "userId", symbol from intelligence_watchlist`);
await tryQ("scheduled_tasks", () =>
  sql`select id from scheduled_tasks where enabled = true and "deletedAt" is null limit 10`,
);

const cols = await sql`
  select table_name, column_name
  from information_schema.columns
  where table_schema='public' and table_name in ('indicator_registry','intelligence_watchlist','scheduled_tasks')
  order by table_name, ordinal_position
`;
for (const c of cols) console.log(`${c.table_name}.${c.column_name}`);

await sql.end({ timeout: 2 });

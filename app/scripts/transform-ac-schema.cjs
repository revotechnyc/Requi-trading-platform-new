const fs = require("fs");
const p = "db/autonomous-console-schema.ts";
let s = fs.readFileSync(p, "utf8");

const header = `import { pgSchema, serial, varchar, text, timestamp, integer, boolean, numeric, jsonb, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Autonomous console tables in Postgres schema \`ac\` (avoids public.* collisions). */
export const ac = pgSchema('ac');
`;

s = s.replace(
  /import \{[^}]+\} from 'drizzle-orm\/pg-core'\s*;\s*import \{ sql \} from 'drizzle-orm'\s*;/,
  header,
);
s = s.replace(/pgEnum\(/g, "ac.enum(");
s = s.replace(/pgTable\(/g, "ac.table(");
// drop unused imports noise
s = s.replace(/,\s*check/g, "");
fs.writeFileSync(p, s);
console.log("ok", { acTable: (s.match(/ac\.table\(/g) || []).length, leftoverPg: (s.match(/pgTable\(/g) || []).length });

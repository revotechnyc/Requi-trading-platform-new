const fs = require("fs");
const path = require("path");
const dir = "db/console-sql";

function wrap(content, label) {
  // Strip analytics/raw_ingest schema noise; keep everything under `ac`
  let s = content;
  s = s.replace(/CREATE SCHEMA IF NOT EXISTS analytics;\s*/gi, "");
  s = s.replace(/CREATE SCHEMA IF NOT EXISTS raw_ingest;\s*/gi, "");
  // Qualify CREATE TYPE when using IF NOT EXISTS checks - leave as-is with search_path
  return `-- Auto-wrapped for Requi platform (schema ac)\nCREATE SCHEMA IF NOT EXISTS ac;\nSET search_path TO ac, public;\n\n${s}\n\nSET search_path TO public;\n`;
}

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
  const p = path.join(dir, f);
  const raw = fs.readFileSync(p, "utf8");
  if (raw.includes("CREATE SCHEMA IF NOT EXISTS ac")) {
    console.log("skip already wrapped", f);
    continue;
  }
  fs.writeFileSync(p, wrap(raw, f));
  console.log("wrapped", f);
}

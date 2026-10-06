import '../api/lib/env';
import { getSql } from '../api/queries/connection';
const sql = getSql();
const userId = 'dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4';
const rows = await sql
  select phase, kind, message, ""createdAt""
  from autonomous_events
  where ""userId"" = 
  order by ""createdAt"" desc
  limit 15
;
console.log(rows);
await sql.end({ timeout: 2 });

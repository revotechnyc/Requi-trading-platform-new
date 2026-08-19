// Applies db/migrations to the configured PostgreSQL database.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import 'dotenv/config';

const sql = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { max: 1 })
  : postgres({ host: process.env.PG_SOCKET_DIR, database: process.env.PG_DATABASE ?? 'requi', user: process.env.PG_USER ?? 'postgres', max: 1 });

await migrate(drizzle(sql), { migrationsFolder: 'db/migrations' });
console.log('migrations applied');
await sql.end();

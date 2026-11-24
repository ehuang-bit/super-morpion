import { attachDatabasePool } from '@vercel/functions';
import { Pool } from 'pg';

let cachedPool: Pool | null = null;

function resolveConnectionString(): string {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DB_URL;

  if (!url) {
    throw new Error(
      'Database connection string missing (set DATABASE_URL or POSTGRES_URL).',
    );
  }
  return url;
}

export function getPool(): Pool {
  if (!cachedPool) {
    cachedPool = new Pool({
      connectionString: resolveConnectionString(),
      max: 10,
      idleTimeoutMillis: 15_000,
      connectionTimeoutMillis: 10_000,
    });
    attachDatabasePool(cachedPool);
  }
  return cachedPool;
}

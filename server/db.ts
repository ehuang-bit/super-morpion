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
  // Évite l'avertissement stderr pg-connection-string sur sslmode=require tout en gardant verify-full
  try {
    const parsed = new URL(url);
    const mode = parsed.searchParams.get('sslmode');
    if (mode === 'require' || mode === 'prefer' || mode === 'verify-ca') {
      parsed.searchParams.set('sslmode', 'verify-full');
      return parsed.toString();
    }
  } catch {
    // URL non standard : on renvoie la chaîne telle quelle
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

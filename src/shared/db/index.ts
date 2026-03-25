import pg, { QueryResult, QueryResultRow } from 'pg';
import { config } from '../../config/index.js';
import { logger } from '../../modules/logging/index.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getDbPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      max: config.database.maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected database pool error', err);
    });

    logger.info('Database pool initialized', { 
      host: config.database.host, 
      database: config.database.name 
    });
  }

  return pool;
}

export async function query<T extends QueryResultRow = Record<string, unknown>>(
  text: string, 
  params?: unknown[]
): Promise<QueryResult<T>> {
  const pool = getDbPool();
  const start = Date.now();
  
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Database query executed', { 
      query: text.substring(0, 100), 
      duration,
      rows: result.rowCount 
    });
    
    return result;
  } catch (error) {
    logger.error('Database query failed', error as Error, { 
      query: text.substring(0, 100)
    });
    throw error;
  }
}

export async function getClient(): Promise<pg.PoolClient> {
  const pool = getDbPool();
  return pool.connect();
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const result = await query<{ check: number }>('SELECT 1 as check');
    return result.rowCount === 1;
  } catch (error) {
    logger.error('Database connection check failed', error as Error);
    return false;
  }
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}
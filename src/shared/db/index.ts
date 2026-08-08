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
      // PostgreSQL RLS policies read this immutable, validated account scope.
      // It is configured at connection startup so pooled sessions cannot leak
      // a tenant selected by a previous request.
      options: `-c app.tenant_id=${config.chatwoot.accountId}`,
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
    const result = await query<{ check: number }>(`
      SELECT CASE WHEN
        to_regclass('public.conversations') IS NOT NULL AND
        to_regclass('public.messages') IS NOT NULL AND
        to_regclass('public.handoffs') IS NOT NULL AND
        to_regclass('public.knowledge_documents') IS NOT NULL AND
        to_regclass('public.knowledge_chunks') IS NOT NULL AND
        to_regclass('public.appointment_services') IS NOT NULL AND
        to_regclass('public.appointment_providers') IS NOT NULL AND
        to_regclass('public.appointment_slots') IS NOT NULL AND
        to_regclass('public.appointments') IS NOT NULL AND
        to_regclass('public.inbound_receipts') IS NOT NULL AND
        to_regclass('public.response_outbox') IS NOT NULL AND
        to_regclass('public.conversation_control_state') IS NOT NULL AND
        to_regclass('public.conversation_scheduling_state') IS NOT NULL
      THEN 1 ELSE 0 END AS check
    `);
    return result.rowCount === 1 && result.rows[0]?.check === 1;
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

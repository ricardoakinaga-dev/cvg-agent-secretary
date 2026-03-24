import pg, { QueryResult, QueryResultRow } from 'pg';
export declare function getDbPool(): pg.Pool;
export declare function query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
export declare function getClient(): Promise<pg.PoolClient>;
export declare function checkDatabaseConnection(): Promise<boolean>;
export declare function closeDbPool(): Promise<void>;
//# sourceMappingURL=index.d.ts.map
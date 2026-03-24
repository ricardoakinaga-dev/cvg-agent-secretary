"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDbPool = getDbPool;
exports.query = query;
exports.getClient = getClient;
exports.checkDatabaseConnection = checkDatabaseConnection;
exports.closeDbPool = closeDbPool;
const pg_1 = __importDefault(require("pg"));
const index_js_1 = require("../../config/index.js");
const index_js_2 = require("../../modules/logging/index.js");
const { Pool } = pg_1.default;
let pool = null;
function getDbPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: index_js_1.config.database.url,
            max: index_js_1.config.database.maxConnections,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        });
        pool.on('error', (err) => {
            index_js_2.logger.error('Unexpected database pool error', err);
        });
        index_js_2.logger.info('Database pool initialized', {
            host: index_js_1.config.database.host,
            database: index_js_1.config.database.name
        });
    }
    return pool;
}
async function query(text, params) {
    const pool = getDbPool();
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        index_js_2.logger.debug('Database query executed', {
            query: text.substring(0, 100),
            duration,
            rows: result.rowCount
        });
        return result;
    }
    catch (error) {
        index_js_2.logger.error('Database query failed', error, {
            query: text.substring(0, 100)
        });
        throw error;
    }
}
async function getClient() {
    const pool = getDbPool();
    return pool.connect();
}
async function checkDatabaseConnection() {
    try {
        const result = await query('SELECT 1 as check');
        return result.rowCount === 1;
    }
    catch (error) {
        index_js_2.logger.error('Database connection check failed', error);
        return false;
    }
}
async function closeDbPool() {
    if (pool) {
        await pool.end();
        pool = null;
        index_js_2.logger.info('Database pool closed');
    }
}
//# sourceMappingURL=index.js.map
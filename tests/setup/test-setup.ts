import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-tests-only';
process.env.CHATWOOT_API_TOKEN = 'test-chatwoot-token';
process.env.CHATWOOT_ACCOUNT_ID = 'test-account-id';
process.env.CHATWOOT_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.API_ADMIN_TOKEN = 'test-admin-token';
process.env.NODE_ENV = 'test';

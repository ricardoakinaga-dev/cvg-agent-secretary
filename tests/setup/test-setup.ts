import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-tests-only';
process.env.CHATWOOT_API_TOKEN = 'test-chatwoot-token';
process.env.CHATWOOT_ACCOUNT_ID = 'test-account-id';
process.env.NODE_ENV = 'test';
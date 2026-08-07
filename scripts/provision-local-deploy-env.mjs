import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

const workspace = process.cwd();
const envPath = path.join(workspace, '.env');
const privateDirectory = '/root/.config/cvg-agent-secretary';
const privateKeyPath = path.join(privateDirectory, 'jwt-private.pem');

const existingText = await readFile(envPath, 'utf8');
const existing = dotenv.parse(existingText);
const additions = new Map();

function add(name, value) {
  if (!existing[name]) additions.set(name, value);
}

function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

add('POSTGRES_DB', 'cvg_agent');
add('POSTGRES_ADMIN_USER', 'postgres');
add('POSTGRES_ADMIN_PASSWORD', randomSecret());
add('POSTGRES_APP_USER', 'cvg_agent_app');
add('POSTGRES_APP_PASSWORD', randomSecret());
add('REDIS_USERNAME', 'cvg_agent');
add('REDIS_PASSWORD', randomSecret());
add('CHATWOOT_INBOX_IDS', '1');
add('TRUST_PROXY_HOPS', '0');
add('API_JWT_ISSUER', 'cvg-agent-secretary');
add('API_JWT_AUDIENCE', 'cvg-agent-api');
add('ALLOW_LEGACY_API_TOKEN', 'false');
add('PII_ENCRYPTION_REQUIRED', 'true');
add('PII_ACTIVE_KEY_ID', 'deploy-20260802');

if (!existing.PII_ENCRYPTION_KEYS_JSON) {
  additions.set('PII_ENCRYPTION_KEYS_JSON', JSON.stringify({
    'deploy-20260802': randomBytes(32).toString('base64'),
  }));
}
add('PII_LOOKUP_KEY', randomBytes(32).toString('base64'));

if (!existing.API_JWT_PUBLIC_KEY) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  await writeFile(privateKeyPath, privateKey, { mode: 0o600 });
  await chmod(privateKeyPath, 0o600);
  additions.set('API_JWT_PUBLIC_KEY', publicKey.replace(/\n/g, '\\n'));
}

if (additions.size > 0) {
  const lines = [...additions.entries()].map(([name, value]) => `${name}=${value}`);
  const separator = existingText.endsWith('\n') ? '' : '\n';
  await writeFile(envPath, `${existingText}${separator}${lines.join('\n')}\n`, { mode: 0o600 });
}
await chmod(envPath, 0o600);

process.stdout.write(JSON.stringify({
  added: [...additions.keys()],
  privateKeyPath: existing.API_JWT_PUBLIC_KEY ? undefined : privateKeyPath,
}) + '\n');

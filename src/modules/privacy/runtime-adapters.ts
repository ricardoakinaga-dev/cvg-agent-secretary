import Redis from 'ioredis';
import { z } from 'zod';
import { config } from '../../config';
import { redisClient } from '../../shared/redis';
import { PostgresPrivacyGateway, PrivacyQueryClient } from './adapters';
import {
  PrivacyRecoveryAdapter,
  PrivacyStoreAdapter,
  RetentionStoreContext,
  StoreMutationResult,
  StoreOperationContext,
  StorePreviewResult,
  SubjectStoreContext,
} from './types';

const MAX_SUBJECT_SCAN_KEYS = 10_000;
const WEBHOOK_DLQ_KEY_SUFFIX = 'queue:chatwoot:webhooks:failed';

const checkpointSchema = z.array(z.object({
  id: z.string().trim().min(8).max(200).regex(/^[a-zA-Z0-9._:-]+$/),
  tenantId: z.string().regex(/^[1-9]\d{0,18}$/),
  createdAt: z.string().datetime(),
  verified: z.literal(true),
}));

type Checkpoint = z.infer<typeof checkpointSchema>[number];

interface RedisEntry {
  key: string;
  type: 'string' | 'list' | 'hash' | 'set' | 'zset';
  field?: string;
  value: string;
}

function parsedJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function containsToken(value: unknown, tokens: Set<string>): boolean {
  if (typeof value === 'string' || typeof value === 'number') {
    return tokens.has(String(value));
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsToken(item, tokens));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .some((item) => containsToken(item, tokens));
  }
  return false;
}

export class ConfiguredPrivacyRecoveryAdapter implements PrivacyRecoveryAdapter {
  private readonly checkpoints: Checkpoint[];

  constructor(rawCheckpointsJson: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawCheckpointsJson);
    } catch {
      throw new Error('Privacy recovery checkpoint catalog is invalid JSON');
    }
    const result = checkpointSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error('Privacy recovery checkpoint catalog is invalid');
    }
    this.checkpoints = result.data;
  }

  async verifyCheckpoint(input: {
    tenantId: string;
    checkpointId: string;
    createdBefore: Date;
  }): Promise<boolean> {
    return this.checkpoints.some((checkpoint) =>
      checkpoint.tenantId === input.tenantId
      && checkpoint.id === input.checkpointId
      && new Date(checkpoint.createdAt).getTime() <= input.createdBefore.getTime());
  }
}

export class RedisPrivacyStoreAdapter implements PrivacyStoreAdapter {
  readonly name = 'redis' as const;

  constructor(
    private readonly getRedis: () => Redis,
    private readonly gateway: PostgresPrivacyGateway
  ) {}

  async preflight(context: StoreOperationContext): Promise<void> {
    this.assertTenant(context.tenantId);
    const pong = await this.getRedis().ping();
    if (pong !== 'PONG') {
      throw new Error('Redis privacy preflight failed');
    }
  }

  async previewRetention(context: RetentionStoreContext): Promise<StorePreviewResult> {
    this.assertTenant(context.tenantId);
    if (context.resource !== 'webhook_dlq') {
      throw new Error('Unsupported Redis retention resource');
    }
    const matched = await this.getRedis().zcount(
      this.key(context.tenantId, WEBHOOK_DLQ_KEY_SUFFIX),
      '-inf',
      context.cutoff.getTime()
    );
    return { matched: Math.min(matched, context.batchSize) };
  }

  async purgeRetention(context: RetentionStoreContext): Promise<StoreMutationResult> {
    this.assertTenant(context.tenantId);
    if (context.resource !== 'webhook_dlq') {
      throw new Error('Unsupported Redis retention resource');
    }
    const key = this.key(context.tenantId, WEBHOOK_DLQ_KEY_SUFFIX);
    const candidates = await this.getRedis().zrangebyscore(
      key,
      '-inf',
      context.cutoff.getTime(),
      'LIMIT',
      0,
      context.batchSize
    );
    if (candidates.length === 0) return { affected: 0 };
    return { affected: await this.getRedis().zrem(key, ...candidates) };
  }

  async exportSubject(context: SubjectStoreContext): Promise<unknown> {
    const tokens = await this.subjectTokens(context);
    return { entries: await this.findEntries(context.tenantId, tokens) };
  }

  async anonymizeSubject(context: SubjectStoreContext): Promise<StoreMutationResult> {
    return this.removeSubjectEntries(context);
  }

  async eraseSubject(context: SubjectStoreContext): Promise<StoreMutationResult> {
    return this.removeSubjectEntries(context);
  }

  private async removeSubjectEntries(context: SubjectStoreContext): Promise<StoreMutationResult> {
    const tokens = await this.subjectTokens(context);
    const entries = await this.findEntries(context.tenantId, tokens);
    if (entries.length === 0) return { affected: 0 };

    const redis = this.getRedis();
    const transaction = redis.multi();
    for (const entry of entries) {
      if (entry.type === 'string') transaction.del(entry.key);
      else if (entry.type === 'list') transaction.lrem(entry.key, 0, entry.value);
      else if (entry.type === 'hash' && entry.field) transaction.hdel(entry.key, entry.field);
      else if (entry.type === 'set') transaction.srem(entry.key, entry.value);
      else if (entry.type === 'zset') transaction.zrem(entry.key, entry.value);
    }
    const results = await transaction.exec();
    if (!results) throw new Error('Redis privacy transaction was aborted');
    for (const [error] of results) {
      if (error) throw new Error('Redis privacy mutation failed');
    }
    return { affected: entries.length };
  }

  private async subjectTokens(context: SubjectStoreContext): Promise<Set<string>> {
    this.assertTenant(context.tenantId);
    return this.gateway.withClient(async (client: PrivacyQueryClient) => {
      const identifiers = await client.query(`
        SELECT contact.chatwoot_id::TEXT AS identifier
        FROM contacts contact
        WHERE contact.tenant_id = $1 AND contact.id = $2
        UNION
        SELECT conversation.id::TEXT
        FROM conversations conversation
        JOIN contacts contact ON contact.tenant_id = conversation.tenant_id
          AND contact.chatwoot_id = conversation.chatwoot_contact_id
        WHERE conversation.tenant_id = $1 AND contact.id = $2
        UNION
        SELECT conversation.chatwoot_conversation_id::TEXT
        FROM conversations conversation
        JOIN contacts contact ON contact.tenant_id = conversation.tenant_id
          AND contact.chatwoot_id = conversation.chatwoot_contact_id
        WHERE conversation.tenant_id = $1 AND contact.id = $2
      `, [context.tenantId, context.contactId]);
      return new Set([
        context.contactId,
        ...identifiers.rows.map((row) => String(row.identifier || '')).filter(Boolean),
      ]);
    });
  }

  private async findEntries(tenantId: string, tokens: Set<string>): Promise<RedisEntry[]> {
    const redis = this.getRedis();
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await redis.scan(
        cursor,
        'MATCH',
        `${this.key(tenantId, '')}*`,
        'COUNT',
        250
      );
      cursor = nextCursor;
      keys.push(...batch);
      if (keys.length > MAX_SUBJECT_SCAN_KEYS) {
        throw new Error('Redis privacy scan key limit exceeded');
      }
    } while (cursor !== '0');

    const matches: RedisEntry[] = [];
    for (const key of keys) {
      const type = await redis.type(key);
      if (type === 'string') {
        const value = await redis.get(key);
        if (value !== null && containsToken(parsedJson(value), tokens)) {
          matches.push({ key, type, value });
        }
      } else if (type === 'list') {
        for (const value of await redis.lrange(key, 0, -1)) {
          if (containsToken(parsedJson(value), tokens)) matches.push({ key, type, value });
        }
      } else if (type === 'hash') {
        const values = await redis.hgetall(key);
        for (const [field, value] of Object.entries(values)) {
          if (containsToken(parsedJson(value), tokens) || tokens.has(field)) {
            matches.push({ key, type, field, value });
          }
        }
      } else if (type === 'set') {
        for (const value of await redis.smembers(key)) {
          if (containsToken(parsedJson(value), tokens)) matches.push({ key, type, value });
        }
      } else if (type === 'zset') {
        for (const value of await redis.zrange(key, 0, -1)) {
          if (containsToken(parsedJson(value), tokens)) matches.push({ key, type, value });
        }
      }
    }
    return matches;
  }

  private key(tenantId: string, suffix: string): string {
    return `cvg:${tenantId}:${suffix}`;
  }

  private assertTenant(tenantId: string): void {
    if (tenantId !== config.chatwoot.accountId) {
      throw new Error('Redis privacy tenant does not match configured account');
    }
  }
}

export function runtimeRedisPrivacyAdapter(
  gateway: PostgresPrivacyGateway
): RedisPrivacyStoreAdapter {
  return new RedisPrivacyStoreAdapter(() => redisClient.getClient(), gateway);
}

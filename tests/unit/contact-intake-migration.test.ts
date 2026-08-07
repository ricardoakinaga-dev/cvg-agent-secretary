import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('contact intake migration', () => {
  it('adds a bounded JSON intake context to conversations', () => {
    const migration = readFileSync(
      resolve('database/migrations/20260802_zz_conversation_intake.sql'),
      'utf8'
    );
    const schema = readFileSync(resolve('database/schema.sql'), 'utf8');

    expect(migration).toMatch(/ALTER TABLE conversations[\s\S]+contact_intake JSONB/i);
    expect(migration).toContain("CHECK (jsonb_typeof(contact_intake) = 'object')");
    expect(schema).toContain("contact_intake JSONB NOT NULL DEFAULT '{}'::JSONB");
  });
});

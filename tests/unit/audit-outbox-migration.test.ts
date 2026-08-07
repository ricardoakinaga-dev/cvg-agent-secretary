import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('audit outbox migration', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'database/migrations/20260802_z_audit_outbox.sql'),
    'utf8'
  );

  it('creates a tenant-scoped idempotent outbox and an idempotent projection', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS audit_outbox');
    expect(sql).toContain('UNIQUE (tenant_id, idempotency_key)');
    expect(sql).toContain('UNIQUE (tenant_id, id)');
    expect(sql).toContain('UNIQUE (tenant_id, outbox_event_id)');
    expect(sql).toContain('FOREIGN KEY (tenant_id, outbox_event_id)');
  });

  it('enables tenant RLS and makes both audit stores append-only', () => {
    expect(sql).toContain('ALTER TABLE audit_outbox ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain("current_setting('app.tenant_id', true)");
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON audit_outbox');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON audit_events');
    expect(sql).toContain('Audit records are append-only');
  });

  it('requires outbox evidence for signed-identity projections', () => {
    expect(sql).toContain("actor_source <> 'signed_identity' OR outbox_event_id IS NOT NULL");
    expect(sql).toContain("integrity_hash ~ '^[0-9a-f]{64}$'");
  });
});

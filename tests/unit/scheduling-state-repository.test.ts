const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db', () => ({ query: mockQuery }));
vi.mock('../../src/config', () => ({ config: { chatwoot: { accountId: '42' } } }));

import { describe, expect, it, beforeEach } from 'vitest';
import { SchedulingStateRepository } from '../../src/modules/scheduling/stateRepository';

describe('scheduling state repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads a tenant-scoped state and uses the database timestamp', async () => {
    const updatedAt = new Date('2026-08-08T01:00:00.000Z');
    mockQuery.mockResolvedValueOnce({
      rows: [{
        state: { stage: 'waiting_slot_confirmation', appointmentId: 'appointment-1' },
        updated_at: updatedAt,
      }],
    });

    await expect(new SchedulingStateRepository().get('conversation-1')).resolves.toEqual({
      stage: 'waiting_slot_confirmation',
      appointmentId: 'appointment-1',
      updatedAt: updatedAt.toISOString(),
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE tenant_id = $1 AND conversation_id = $2'),
      ['42', 'conversation-1']
    );
  });

  it('upserts state by tenant and conversation and fails when the database returns no row', async () => {
    const updatedAt = new Date('2026-08-08T01:01:00.000Z');
    mockQuery.mockResolvedValueOnce({
      rows: [{ state: { stage: 'confirmed', contactId: 'contact-1' }, updated_at: updatedAt }],
    });

    await expect(new SchedulingStateRepository().upsert('conversation-1', {
      stage: 'confirmed',
      contactId: 'contact-1',
    })).resolves.toEqual({
      stage: 'confirmed',
      contactId: 'contact-1',
      updatedAt: updatedAt.toISOString(),
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (tenant_id, conversation_id) DO UPDATE'),
      ['42', 'conversation-1', JSON.stringify({ stage: 'confirmed', contactId: 'contact-1' })]
    );

    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(new SchedulingStateRepository().upsert('conversation-1', {
      stage: 'idle',
    })).rejects.toThrow('Durable scheduling state upsert returned no row');
  });

  it('rejects malformed durable state instead of silently reopening automation', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ state: { stage: 'unknown' }, updated_at: new Date() }],
    });

    await expect(new SchedulingStateRepository().get('conversation-1'))
      .rejects.toThrow('Invalid durable scheduling state stage');
  });
});

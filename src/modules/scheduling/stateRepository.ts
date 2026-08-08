import { query } from '../../shared/db/index.js';
import { config } from '../../config/index.js';

export type SchedulingStage =
  | 'idle'
  | 'collecting_details'
  | 'checking_availability'
  | 'waiting_slot_confirmation'
  | 'reserved'
  | 'confirmed'
  | 'cancelled';

export interface SchedulingConversationState {
  stage: SchedulingStage;
  appointmentId?: string;
  slotId?: string;
  serviceId?: string;
  petName?: string;
  contactId?: string;
  lastIntent?: string;
  updatedAt: string;
}

export type SchedulingConversationStateInput = Omit<SchedulingConversationState, 'updatedAt'>;

interface SchedulingStateRow extends Record<string, unknown> {
  state: unknown;
  updated_at: Date | string;
}

const VALID_STAGES = new Set<SchedulingStage>([
  'idle',
  'collecting_details',
  'checking_availability',
  'waiting_slot_confirmation',
  'reserved',
  'confirmed',
  'cancelled',
]);

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function rowTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRow(row: SchedulingStateRow): SchedulingConversationState {
  if (!row.state || typeof row.state !== 'object' || Array.isArray(row.state)) {
    throw new Error('Invalid durable scheduling state payload');
  }

  const value = row.state as Record<string, unknown>;
  const stage = value.stage;
  if (typeof stage !== 'string' || !VALID_STAGES.has(stage as SchedulingStage)) {
    throw new Error('Invalid durable scheduling state stage');
  }

  return {
    stage: stage as SchedulingStage,
    appointmentId: stringField(value.appointmentId),
    slotId: stringField(value.slotId),
    serviceId: stringField(value.serviceId),
    petName: stringField(value.petName),
    contactId: stringField(value.contactId),
    lastIntent: stringField(value.lastIntent),
    updatedAt: rowTimestamp(row.updated_at),
  };
}

export class SchedulingStateRepository {
  async get(conversationId: string): Promise<SchedulingConversationState | null> {
    const result = await query<SchedulingStateRow>(`
      SELECT state, updated_at
      FROM conversation_scheduling_state
      WHERE tenant_id = $1 AND conversation_id = $2
    `, [config.chatwoot.accountId, conversationId]);
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  async upsert(
    conversationId: string,
    state: SchedulingConversationStateInput
  ): Promise<SchedulingConversationState> {
    const result = await query<SchedulingStateRow>(`
      INSERT INTO conversation_scheduling_state (
        tenant_id, conversation_id, state
      ) VALUES ($1, $2, $3::JSONB)
      ON CONFLICT (tenant_id, conversation_id) DO UPDATE SET
        state = EXCLUDED.state,
        updated_at = NOW()
      RETURNING state, updated_at
    `, [
      config.chatwoot.accountId,
      conversationId,
      JSON.stringify(state),
    ]);
    const row = result.rows[0];
    if (!row) throw new Error('Durable scheduling state upsert returned no row');
    return mapRow(row);
  }
}

export const schedulingStateRepository = new SchedulingStateRepository();

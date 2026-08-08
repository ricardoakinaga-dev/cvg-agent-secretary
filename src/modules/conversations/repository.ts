import { query } from '../../shared/db';
import { maskSensitiveData } from '../../shared/data-masking';
import { config } from '../../config';
import { ContactIntakeState } from '../../shared/types';

export type PersistedConversationStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type PersistedMessageType = 'incoming' | 'outgoing';
export type PersistedSenderType = 'user' | 'agent' | 'bot';

export interface UpsertConversationInput {
  chatwootConversationId: number;
  chatwootContactId: number;
  contactName?: string;
  status: PersistedConversationStatus;
  lastMessageAt?: Date;
}

export interface PersistedConversation {
  id: string;
  tenantId: string;
  chatwootConversationId: number;
  chatwootContactId: number;
  contactName?: string;
  status: PersistedConversationStatus;
  startedAt: Date;
  lastMessageAt?: Date;
  contactIntake?: ContactIntakeState;
}

export interface SaveMessageInput {
  conversationId: string;
  chatwootMessageId: number;
  content: string;
  messageType: PersistedMessageType;
  senderType: PersistedSenderType;
  senderName?: string;
  createdAt?: Date;
}

export interface PersistedMessage {
  id: string;
  tenantId: string;
  conversationId: string;
  chatwootMessageId: number;
  content: string;
  messageType: PersistedMessageType;
  senderType: PersistedSenderType;
  senderName?: string;
  createdAt: Date;
}

export type ConversationControlState = 'automated' | 'handoff_pending' | 'handoff_active' | 'completed';

export interface ConversationControl {
  conversationId: string;
  state: ConversationControlState;
  handoffUntil: Date | null;
  handoffExpiredAt: Date | null;
  handoffReason: string | null;
  handoffOwner: string | null;
  version: number;
  updatedAt: Date;
}

type ConversationRow = Record<string, unknown>;
type MessageRow = Record<string, unknown>;

function mapContactIntake(value: unknown): ContactIntakeState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const intake = value as Record<string, unknown>;
  const validStages = new Set(['identification', 'data_collection', 'ready']);
  const validRoles = new Set(['tutor', 'cliente', 'colaborador', 'fornecedor', 'outro']);
  const boundedOptionalString = (field: string, maxChars: number): string | undefined | null => {
    const fieldValue = intake[field];
    if (fieldValue === undefined) return undefined;
    if (typeof fieldValue !== 'string' || fieldValue.length === 0 || fieldValue.length > maxChars) {
      return null;
    }
    return fieldValue;
  };
  const contactRole = boundedOptionalString('contactRole', 20);
  const contactReason = boundedOptionalString('contactReason', 500);
  const reasonIntent = boundedOptionalString('reasonIntent', 64);
  const petName = boundedOptionalString('petName', 120);
  const petSpecies = boundedOptionalString('petSpecies', 120);
  const sector = boundedOptionalString('sector', 120);
  const organization = boundedOptionalString('organization', 120);
  if (
    typeof intake.stage !== 'string'
    || !validStages.has(intake.stage)
    || typeof intake.unansweredAttempts !== 'number'
    || !Number.isInteger(intake.unansweredAttempts)
    || intake.unansweredAttempts < 0
    || intake.unansweredAttempts > 3
    || typeof intake.updatedAt !== 'string'
    || Number.isNaN(Date.parse(intake.updatedAt))
    || contactRole === null
    || (contactRole !== undefined && !validRoles.has(contactRole))
    || contactReason === null
    || reasonIntent === null
    || petName === null
    || petSpecies === null
    || sector === null
    || organization === null
    || (intake.stage === 'ready' && (!contactRole || !contactReason))
  ) {
    return undefined;
  }

  return {
    stage: intake.stage as ContactIntakeState['stage'],
    unansweredAttempts: intake.unansweredAttempts,
    updatedAt: intake.updatedAt,
    ...(contactRole ? { contactRole: contactRole as ContactIntakeState['contactRole'] } : {}),
    ...(contactReason ? { contactReason } : {}),
    ...(reasonIntent ? { reasonIntent } : {}),
    ...(petName ? { petName } : {}),
    ...(petSpecies ? { petSpecies } : {}),
    ...(sector ? { sector } : {}),
    ...(organization ? { organization } : {}),
  };
}

export class ConversationRepository {
  async upsertConversation(input: UpsertConversationInput): Promise<PersistedConversation> {
    const result = await query<ConversationRow>(`
      INSERT INTO conversations (
        tenant_id,
        chatwoot_conversation_id,
        chatwoot_contact_id,
        contact_name,
        status,
        last_message_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, chatwoot_conversation_id) DO UPDATE SET
        chatwoot_contact_id = CASE
          WHEN EXCLUDED.chatwoot_contact_id > 0 THEN EXCLUDED.chatwoot_contact_id
          ELSE conversations.chatwoot_contact_id
        END,
        contact_name = COALESCE(NULLIF(EXCLUDED.contact_name, ''), conversations.contact_name),
        status = EXCLUDED.status,
        last_message_at = COALESCE(
          GREATEST(conversations.last_message_at, EXCLUDED.last_message_at),
          conversations.last_message_at,
          EXCLUDED.last_message_at
        )
      RETURNING *
    `, [
      config.chatwoot.accountId,
      input.chatwootConversationId,
      input.chatwootContactId,
      input.contactName || null,
      input.status,
      input.lastMessageAt || null,
    ]);

    return this.mapConversation(result.rows[0]);
  }

  async saveMessage(input: SaveMessageInput): Promise<PersistedMessage | null> {
    const result = await query<MessageRow>(`
      INSERT INTO messages (
        tenant_id,
        conversation_id,
        chatwoot_message_id,
        content,
        message_type,
        sender_type,
        sender_name,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id, conversation_id, chatwoot_message_id) DO NOTHING
      RETURNING *
    `, [
      config.chatwoot.accountId,
      input.conversationId,
      input.chatwootMessageId,
      maskSensitiveData(input.content),
      input.messageType,
      input.senderType,
      input.senderName || null,
      input.createdAt || new Date(),
    ]);

    return result.rows[0] ? this.mapMessage(result.rows[0]) : null;
  }

  async findById(conversationId: string): Promise<PersistedConversation | null> {
    const result = await query<ConversationRow>(`
      SELECT * FROM conversations
      WHERE tenant_id = $1 AND id = $2
    `, [config.chatwoot.accountId, conversationId]);
    return result.rows[0] ? this.mapConversation(result.rows[0]) : null;
  }

  async findByChatwootConversationId(chatwootConversationId: number): Promise<PersistedConversation | null> {
    const result = await query<ConversationRow>(`
      SELECT * FROM conversations
      WHERE tenant_id = $1 AND chatwoot_conversation_id = $2
    `, [config.chatwoot.accountId, chatwootConversationId]);
    return result.rows[0] ? this.mapConversation(result.rows[0]) : null;
  }

  async listMessages(conversationId: string, limit = 50): Promise<PersistedMessage[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
    const result = await query<MessageRow>(`
      SELECT *
      FROM messages
      WHERE tenant_id = $1 AND conversation_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT $3
    `, [config.chatwoot.accountId, conversationId, safeLimit]);
    return result.rows.reverse().map((row) => this.mapMessage(row));
  }

  async updateContactIntake(
    conversationId: string,
    intake: ContactIntakeState
  ): Promise<void> {
    const protectedIntake: ContactIntakeState = {
      ...intake,
      ...(intake.contactReason
        ? { contactReason: maskSensitiveData(intake.contactReason).slice(0, 500) }
        : {}),
      ...(intake.petName
        ? { petName: maskSensitiveData(intake.petName).slice(0, 120) }
        : {}),
      ...(intake.petSpecies
        ? { petSpecies: maskSensitiveData(intake.petSpecies).slice(0, 120) }
        : {}),
      ...(intake.sector
        ? { sector: maskSensitiveData(intake.sector).slice(0, 120) }
        : {}),
      ...(intake.organization
        ? { organization: maskSensitiveData(intake.organization).slice(0, 120) }
        : {}),
    };
    const result = await query<{ id: string }>(`
      UPDATE conversations
      SET contact_intake = $3::JSONB
      WHERE tenant_id = $1 AND id = $2
      RETURNING id
    `, [
      config.chatwoot.accountId,
      conversationId,
      JSON.stringify(protectedIntake),
    ]);

    if ((result.rowCount ?? result.rows.length) === 0) {
      throw new Error('Conversation not found for contact intake update');
    }
  }

  async getControlState(conversationId: string): Promise<ConversationControl | null> {
    const result = await query<Record<string, unknown>>(`
      SELECT conversation_id, state, handoff_until, handoff_expired_at, handoff_reason, handoff_owner, version, updated_at
      FROM conversation_control_state
      WHERE tenant_id = $1 AND conversation_id = $2
    `, [config.chatwoot.accountId, conversationId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      conversationId: String(row.conversation_id),
      state: row.state as ConversationControlState,
      handoffUntil: row.handoff_until == null ? null : new Date(String(row.handoff_until)),
      handoffExpiredAt: row.handoff_expired_at == null ? null : new Date(String(row.handoff_expired_at)),
      handoffReason: row.handoff_reason == null ? null : String(row.handoff_reason),
      handoffOwner: row.handoff_owner == null ? null : String(row.handoff_owner),
      version: Number(row.version),
      updatedAt: new Date(String(row.updated_at)),
    };
  }

  async setControlState(
    conversationId: string,
    state: ConversationControlState,
    options: {
      handoffUntil?: Date | null;
      handoffExpiredAt?: Date | null;
      handoffReason?: string | null;
      handoffOwner?: string | null;
      expectedVersion?: number;
    } = {}
  ): Promise<ConversationControl> {
    const result = await query<Record<string, unknown>>(`
      INSERT INTO conversation_control_state (
        tenant_id, conversation_id, state, handoff_until, handoff_expired_at, handoff_reason, handoff_owner
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, conversation_id) DO UPDATE SET
        state = EXCLUDED.state,
        handoff_until = EXCLUDED.handoff_until,
        handoff_expired_at = EXCLUDED.handoff_expired_at,
        handoff_reason = EXCLUDED.handoff_reason,
        handoff_owner = EXCLUDED.handoff_owner,
        version = conversation_control_state.version + 1
      WHERE $8::BIGINT IS NULL OR conversation_control_state.version = $8
      RETURNING conversation_id, state, handoff_until, handoff_expired_at, handoff_reason, handoff_owner, version, updated_at
    `, [
      config.chatwoot.accountId,
      conversationId,
      state,
      options.handoffUntil ?? null,
      options.handoffExpiredAt ?? null,
      options.handoffReason ? maskSensitiveData(options.handoffReason).slice(0, 500) : null,
      options.handoffOwner ?? null,
      options.expectedVersion ?? null,
    ]);
    const row = result.rows[0];
    if (!row) throw new Error('Conversation control state version conflict');
    return {
      conversationId: String(row.conversation_id),
      state: row.state as ConversationControlState,
      handoffUntil: row.handoff_until == null ? null : new Date(String(row.handoff_until)),
      handoffExpiredAt: row.handoff_expired_at == null ? null : new Date(String(row.handoff_expired_at)),
      handoffReason: row.handoff_reason == null ? null : String(row.handoff_reason),
      handoffOwner: row.handoff_owner == null ? null : String(row.handoff_owner),
      version: Number(row.version),
      updatedAt: new Date(String(row.updated_at)),
    };
  }

  private mapConversation(row: ConversationRow): PersistedConversation {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      chatwootConversationId: Number(row.chatwoot_conversation_id),
      chatwootContactId: Number(row.chatwoot_contact_id),
      contactName: row.contact_name ? String(row.contact_name) : undefined,
      status: row.status as PersistedConversationStatus,
      startedAt: new Date(String(row.started_at)),
      lastMessageAt: row.last_message_at ? new Date(String(row.last_message_at)) : undefined,
      contactIntake: mapContactIntake(row.contact_intake),
    };
  }

  private mapMessage(row: MessageRow): PersistedMessage {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      conversationId: String(row.conversation_id),
      chatwootMessageId: Number(row.chatwoot_message_id),
      content: String(row.content),
      messageType: row.message_type as PersistedMessageType,
      senderType: row.sender_type as PersistedSenderType,
      senderName: row.sender_name ? String(row.sender_name) : undefined,
      createdAt: new Date(String(row.created_at)),
    };
  }
}

export const conversationRepository = new ConversationRepository();

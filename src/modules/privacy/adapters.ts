import { createHash } from 'crypto';
import { mapStoredContact } from '../contacts/pii';
import type { ContactRow } from '../contacts/types';
import {
  PrivacyStoreAdapter,
  RetentionStoreContext,
  StoreMutationResult,
  StoreName,
  StoreOperationContext,
  StorePreviewResult,
  SubjectStoreContext,
} from './types';

export interface PrivacyQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}

export interface PrivacyQueryClient {
  query(sql: string, parameters?: unknown[]): Promise<PrivacyQueryResult>;
}

export interface PostgresPrivacyGateway {
  withClient<T>(work: (client: PrivacyQueryClient) => Promise<T>): Promise<T>;
  withTransaction<T>(work: (client: PrivacyQueryClient) => Promise<T>): Promise<T>;
}

interface RetentionResource {
  table: string;
  timestampColumn: string;
  identityColumns: readonly string[];
}

const IDENTITY_BY_ID = ['id'] as const;

const RETENTION_RESOURCES: Readonly<Record<string, RetentionResource>> = {
  messages: { table: 'messages', timestampColumn: 'created_at', identityColumns: IDENTITY_BY_ID },
  conversation_summaries: { table: 'conversation_summaries', timestampColumn: 'created_at', identityColumns: IDENTITY_BY_ID },
  tool_executions: { table: 'tool_executions', timestampColumn: 'created_at', identityColumns: IDENTITY_BY_ID },
  handoffs: { table: 'handoffs', timestampColumn: 'created_at', identityColumns: IDENTITY_BY_ID },
  sector_notifications: { table: 'sector_notifications', timestampColumn: 'created_at', identityColumns: IDENTITY_BY_ID },
  followup_tasks: { table: 'followup_tasks', timestampColumn: 'created_at', identityColumns: IDENTITY_BY_ID },
  analytics_events: { table: 'analytics_events', timestampColumn: 'created_at', identityColumns: IDENTITY_BY_ID },
  response_feedback: { table: 'response_feedback', timestampColumn: 'created_at', identityColumns: IDENTITY_BY_ID },
  audit_logs: { table: 'audit_logs', timestampColumn: 'created_at', identityColumns: IDENTITY_BY_ID },
  inbound_receipts: { table: 'inbound_receipts', timestampColumn: 'created_at', identityColumns: IDENTITY_BY_ID },
  response_outbox: { table: 'response_outbox', timestampColumn: 'created_at', identityColumns: IDENTITY_BY_ID },
  conversation_control_state: {
    table: 'conversation_control_state',
    timestampColumn: 'updated_at',
    identityColumns: ['tenant_id', 'conversation_id'],
  },
  scheduling_state: {
    table: 'conversation_scheduling_state',
    timestampColumn: 'updated_at',
    identityColumns: ['tenant_id', 'conversation_id'],
  },
};

const SUBJECT_EXPORT_QUERIES: Readonly<Record<string, string>> = {
  contact: 'SELECT * FROM contacts WHERE tenant_id = $1 AND id = $2',
  pets: 'SELECT * FROM pets WHERE tenant_id = $1 AND contact_id = $2',
  memories: 'SELECT * FROM customer_memories WHERE tenant_id = $1 AND contact_id = $2',
  conversations: `
    SELECT conversation.* FROM conversations conversation
    JOIN contacts contact
      ON contact.tenant_id = conversation.tenant_id
      AND contact.chatwoot_id = conversation.chatwoot_contact_id
    WHERE conversation.tenant_id = $1 AND contact.id = $2
  `,
  messages: `
    SELECT message.* FROM messages message
    JOIN conversations conversation
      ON conversation.tenant_id = message.tenant_id AND conversation.id = message.conversation_id
    JOIN contacts contact
      ON contact.tenant_id = conversation.tenant_id
      AND contact.chatwoot_id = conversation.chatwoot_contact_id
    WHERE message.tenant_id = $1 AND contact.id = $2
  `,
  summaries: `
    SELECT summary.* FROM conversation_summaries summary
    JOIN conversations conversation
      ON conversation.tenant_id = summary.tenant_id AND conversation.id = summary.conversation_id
    JOIN contacts contact
      ON contact.tenant_id = conversation.tenant_id
      AND contact.chatwoot_id = conversation.chatwoot_contact_id
    WHERE summary.tenant_id = $1 AND contact.id = $2
  `,
  toolExecutions: `
    SELECT execution.* FROM tool_executions execution
    WHERE execution.tenant_id = $1 AND execution.contact_id = $2
  `,
  handoffs: `SELECT * FROM handoffs WHERE tenant_id = $1 AND contact_id IN (
    $2::TEXT, (SELECT chatwoot_id::TEXT FROM contacts WHERE tenant_id = $1 AND id = $2)
  )`,
  notifications: `SELECT * FROM sector_notifications WHERE tenant_id = $1 AND contact_id IN (
    $2::TEXT, (SELECT chatwoot_id::TEXT FROM contacts WHERE tenant_id = $1 AND id = $2)
  )`,
  appointments: `SELECT * FROM appointments WHERE tenant_id = $1 AND contact_id IN (
    $2::TEXT, (SELECT chatwoot_id::TEXT FROM contacts WHERE tenant_id = $1 AND id = $2)
  )`,
  followups: 'SELECT * FROM followup_tasks WHERE tenant_id = $1 AND contact_id = $2',
  auditLogs: 'SELECT * FROM audit_logs WHERE tenant_id = $1 AND contact_id = $2',
  inboundReceipts: `
    SELECT receipt.* FROM inbound_receipts receipt
    JOIN conversations conversation
      ON conversation.tenant_id = receipt.tenant_id
      AND conversation.chatwoot_conversation_id = receipt.chatwoot_conversation_id
    JOIN contacts contact
      ON contact.tenant_id = conversation.tenant_id
      AND contact.chatwoot_id = conversation.chatwoot_contact_id
    WHERE receipt.tenant_id = $1 AND contact.id = $2
  `,
  responseOutbox: `
    SELECT outbox.* FROM response_outbox outbox
    JOIN conversations conversation
      ON conversation.tenant_id = outbox.tenant_id AND conversation.id = outbox.conversation_id
    JOIN contacts contact
      ON contact.tenant_id = conversation.tenant_id
      AND contact.chatwoot_id = conversation.chatwoot_contact_id
    WHERE outbox.tenant_id = $1 AND contact.id = $2
  `,
  conversationControlState: `
    SELECT control.* FROM conversation_control_state control
    JOIN conversations conversation
      ON conversation.tenant_id = control.tenant_id AND conversation.id = control.conversation_id
    JOIN contacts contact
      ON contact.tenant_id = conversation.tenant_id
      AND contact.chatwoot_id = conversation.chatwoot_contact_id
    WHERE control.tenant_id = $1 AND contact.id = $2
  `,
  schedulingState: `
    SELECT scheduling.* FROM conversation_scheduling_state scheduling
    JOIN conversations conversation
      ON conversation.tenant_id = scheduling.tenant_id
      AND conversation.id = scheduling.conversation_id
    JOIN contacts contact
      ON contact.tenant_id = conversation.tenant_id
      AND contact.chatwoot_id = conversation.chatwoot_contact_id
    WHERE scheduling.tenant_id = $1 AND contact.id = $2
  `,
};

const ANONYMIZATION_QUERIES: readonly string[] = [
  `UPDATE messages SET content = '[ANONYMIZED]', sender_name = NULL
   WHERE tenant_id = $1 AND conversation_id IN (
     SELECT conversation.id FROM conversations conversation
     JOIN contacts contact ON contact.tenant_id = conversation.tenant_id
       AND contact.chatwoot_id = conversation.chatwoot_contact_id
     WHERE conversation.tenant_id = $1 AND contact.id = $2
   )`,
  `UPDATE conversation_summaries
   SET summary_text = '[ANONYMIZED]', key_points = '[]'::JSONB, extracted_facts = '[]'::JSONB,
       handoff_reason = NULL
   WHERE tenant_id = $1 AND conversation_id IN (
     SELECT conversation.id FROM conversations conversation
     JOIN contacts contact ON contact.tenant_id = conversation.tenant_id
       AND contact.chatwoot_id = conversation.chatwoot_contact_id
     WHERE conversation.tenant_id = $1 AND contact.id = $2
   )`,
  `UPDATE tool_executions SET tool_input = '{}'::JSONB, tool_output = NULL, error_message = NULL,
       contact_id = NULL
   WHERE tenant_id = $1 AND contact_id = $2`,
  `UPDATE handoffs SET contact_id = NULL, trigger_reason = '[ANONYMIZED]', summary = NULL,
       pending_questions = '[]'::JSONB, what_was_answered = NULL, what_is_missing = NULL,
       resolution_notes = NULL
   WHERE tenant_id = $1 AND contact_id IN (
     $2::TEXT, (SELECT chatwoot_id::TEXT FROM contacts WHERE tenant_id = $1 AND id = $2)
   )`,
  `UPDATE sector_notifications SET contact_id = NULL, message = '[ANONYMIZED]'
   WHERE tenant_id = $1 AND contact_id IN (
     $2::TEXT, (SELECT chatwoot_id::TEXT FROM contacts WHERE tenant_id = $1 AND id = $2)
   )`,
  `UPDATE appointments SET contact_id = NULL, pet_id = NULL, tutor_name = $3,
       pet_name = NULL, reason = NULL
   WHERE tenant_id = $1 AND contact_id IN (
     $2::TEXT, (SELECT chatwoot_id::TEXT FROM contacts WHERE tenant_id = $1 AND id = $2)
   )`,
  `UPDATE followup_tasks SET contact_id = NULL, title = '[ANONYMIZED]', description = NULL,
       completed_by = NULL
   WHERE tenant_id = $1 AND contact_id = $2`,
  `UPDATE audit_logs SET contact_id = NULL, metadata = jsonb_build_object('anonymized', true)
   WHERE tenant_id = $1 AND contact_id = $2`,
  `UPDATE inbound_receipts SET payload = jsonb_build_object(
      'event', event_type,
      'id', chatwoot_message_id,
      'conversation', jsonb_build_object('id', chatwoot_conversation_id)
    ), correlation_id = 'anonymized', last_error = NULL
   WHERE tenant_id = $1 AND chatwoot_conversation_id IN (
     SELECT chatwoot_conversation_id FROM conversations conversation
     JOIN contacts contact ON contact.tenant_id = conversation.tenant_id
       AND contact.chatwoot_id = conversation.chatwoot_contact_id
     WHERE conversation.tenant_id = $1 AND contact.id = $2
   )`,
  `UPDATE response_outbox SET content = '[ANONYMIZED]', last_error = NULL
   WHERE tenant_id = $1 AND conversation_id IN (
     SELECT conversation.id FROM conversations conversation
     JOIN contacts contact ON contact.tenant_id = conversation.tenant_id
       AND contact.chatwoot_id = conversation.chatwoot_contact_id
     WHERE conversation.tenant_id = $1 AND contact.id = $2
   )`,
  `UPDATE conversation_control_state SET handoff_reason = NULL, handoff_owner = NULL
   WHERE tenant_id = $1 AND conversation_id IN (
     SELECT conversation.id FROM conversations conversation
     JOIN contacts contact ON contact.tenant_id = conversation.tenant_id
       AND contact.chatwoot_id = conversation.chatwoot_contact_id
     WHERE conversation.tenant_id = $1 AND contact.id = $2
   )`,
  `UPDATE conversation_scheduling_state
   SET state = state - 'appointmentId' - 'slotId' - 'serviceId' - 'petName' - 'contactId' - 'lastIntent',
       updated_at = NOW()
   WHERE tenant_id = $1 AND conversation_id IN (
     SELECT conversation.id FROM conversations conversation
     JOIN contacts contact ON contact.tenant_id = conversation.tenant_id
       AND contact.chatwoot_id = conversation.chatwoot_contact_id
     WHERE conversation.tenant_id = $1 AND contact.id = $2
   )`,
  `UPDATE customer_memories SET value = '{}'::JSONB, is_active = false
   WHERE tenant_id = $1 AND contact_id = $2`,
  `UPDATE pets SET name = $3, chatwoot_id = NULL, breed = NULL, birth_date = NULL,
       age_years = NULL, age_months = NULL, gender = NULL, weight = NULL, color = NULL,
       microchip = NULL, vaccination_status = NULL, medical_conditions = NULL,
       behavior_notes = NULL, photo_url = NULL, is_active = false
   WHERE tenant_id = $1 AND contact_id = $2`,
  `UPDATE conversations SET contact_name = $3, chatwoot_contact_id = $4,
       contact_intake = '{}'::JSONB
   WHERE tenant_id = $1 AND chatwoot_contact_id = (
     SELECT chatwoot_id FROM contacts WHERE tenant_id = $1 AND id = $2
   )`,
  `UPDATE contacts SET chatwoot_id = NULL, name = $3, email = NULL, phone = NULL,
       whatsapp = NULL, address = NULL, city = NULL, state = NULL, postal_code = NULL,
       cpf = NULL, notes = NULL, pii_encrypted = '{}'::JSONB,
       name_lookup = NULL, email_lookup = NULL, phone_lookup = NULL,
       whatsapp_lookup = NULL, cpf_lookup = NULL,
       deleted_at = COALESCE(deleted_at, NOW())
   WHERE tenant_id = $1 AND id = $2`,
];

const ERASURE_QUERIES: readonly string[] = [
  `DELETE FROM appointments WHERE tenant_id = $1 AND contact_id IN (
    $2::TEXT, (SELECT chatwoot_id::TEXT FROM contacts WHERE tenant_id = $1 AND id = $2)
  )`,
  'DELETE FROM followup_tasks WHERE tenant_id = $1 AND contact_id = $2',
  `DELETE FROM handoffs WHERE tenant_id = $1 AND contact_id IN (
    $2::TEXT, (SELECT chatwoot_id::TEXT FROM contacts WHERE tenant_id = $1 AND id = $2)
  )`,
  `DELETE FROM sector_notifications WHERE tenant_id = $1 AND contact_id IN (
    $2::TEXT, (SELECT chatwoot_id::TEXT FROM contacts WHERE tenant_id = $1 AND id = $2)
  )`,
  `DELETE FROM inbound_receipts WHERE tenant_id = $1 AND chatwoot_conversation_id IN (
    SELECT conversation.chatwoot_conversation_id FROM conversations conversation
    JOIN contacts contact ON contact.tenant_id = conversation.tenant_id
      AND contact.chatwoot_id = conversation.chatwoot_contact_id
    WHERE conversation.tenant_id = $1 AND contact.id = $2
  )`,
  'DELETE FROM tool_executions WHERE tenant_id = $1 AND contact_id = $2',
  `UPDATE audit_logs SET contact_id = NULL, metadata = jsonb_build_object('erased', true)
   WHERE tenant_id = $1 AND contact_id = $2`,
  `DELETE FROM conversation_scheduling_state WHERE tenant_id = $1 AND conversation_id IN (
    SELECT conversation.id FROM conversations conversation
    JOIN contacts contact ON contact.tenant_id = conversation.tenant_id
      AND contact.chatwoot_id = conversation.chatwoot_contact_id
    WHERE conversation.tenant_id = $1 AND contact.id = $2
  )`,
  `DELETE FROM conversations WHERE tenant_id = $1 AND chatwoot_contact_id = (
     SELECT chatwoot_id FROM contacts WHERE tenant_id = $1 AND id = $2
   )`,
  'DELETE FROM contacts WHERE tenant_id = $1 AND id = $2',
];

function retentionResource(resource: string): RetentionResource {
  const descriptor = RETENTION_RESOURCES[resource];
  if (!descriptor) {
    throw new Error('Unsupported Postgres retention resource');
  }
  return descriptor;
}

function affected(result: PrivacyQueryResult): number {
  return result.rowCount || 0;
}

export class PostgresPrivacyStoreAdapter implements PrivacyStoreAdapter {
  readonly name = 'postgres' as const;

  constructor(private readonly gateway: PostgresPrivacyGateway) {}

  async preflight(context: StoreOperationContext): Promise<void> {
    await this.gateway.withClient(async (client) => {
      await client.query('SELECT $1::BIGINT AS tenant_id', [context.tenantId]);
    });
  }

  async previewRetention(context: RetentionStoreContext): Promise<StorePreviewResult> {
    const descriptor = retentionResource(context.resource);
    return this.gateway.withClient(async (client) => {
      const result = await client.query(`
        SELECT COUNT(*) AS matched FROM (
          SELECT 1 FROM ${descriptor.table}
          WHERE tenant_id = $1 AND ${descriptor.timestampColumn} < $2
          ORDER BY ${descriptor.timestampColumn} ASC
          LIMIT $3
        ) candidates
      `, [context.tenantId, context.cutoff, context.batchSize]);
      return { matched: Number(result.rows[0]?.matched || 0) };
    });
  }

  async purgeRetention(context: RetentionStoreContext): Promise<StoreMutationResult> {
    const descriptor = retentionResource(context.resource);
    const identityColumns = descriptor.identityColumns.join(', ');
    const identityPredicate = descriptor.identityColumns.length === 1
      ? `${identityColumns} IN (SELECT ${identityColumns}`
      : `(${identityColumns}) IN (SELECT ${identityColumns}`;
    return this.gateway.withTransaction(async (client) => {
      const result = await client.query(`
        DELETE FROM ${descriptor.table}
        WHERE ${identityPredicate} FROM ${descriptor.table}
          WHERE tenant_id = $1 AND ${descriptor.timestampColumn} < $2
          ORDER BY ${descriptor.timestampColumn} ASC
          LIMIT $3
          FOR UPDATE SKIP LOCKED
        )
        AND tenant_id = $1
      `, [context.tenantId, context.cutoff, context.batchSize]);
      return { affected: affected(result) };
    });
  }

  async exportSubject(context: SubjectStoreContext): Promise<unknown> {
    return this.gateway.withClient(async (client) => {
      const result: Record<string, unknown[]> = {};
      for (const [resource, sql] of Object.entries(SUBJECT_EXPORT_QUERIES)) {
        const rows = await client.query(sql, [context.tenantId, context.contactId]);
        result[resource] = resource === 'contact'
          ? rows.rows.map((row) => mapStoredContact(row as unknown as ContactRow))
          : rows.rows;
      }
      return result;
    });
  }

  async anonymizeSubject(context: SubjectStoreContext): Promise<StoreMutationResult> {
    const subjectDigest = createHash('sha256')
      .update(`${context.tenantId}:${context.contactId}`)
      .digest('hex');
    const pseudonym = `anonymous-${subjectDigest.slice(0, 12)}`;
    const externalId = -Number((BigInt(`0x${subjectDigest.slice(0, 13)}`) % 9_000_000_000_000_000n) + 1n);

    return this.gateway.withTransaction(async (client) => {
      let total = 0;
      for (const sql of ANONYMIZATION_QUERIES) {
        const result = await client.query(sql, [
          context.tenantId,
          context.contactId,
          pseudonym,
          externalId,
        ]);
        total += affected(result);
      }
      return { affected: total };
    });
  }

  async eraseSubject(context: SubjectStoreContext): Promise<StoreMutationResult> {
    return this.gateway.withTransaction(async (client) => {
      let total = 0;
      for (const sql of ERASURE_QUERIES) {
        const result = await client.query(sql, [context.tenantId, context.contactId]);
        total += affected(result);
      }
      return { affected: total };
    });
  }
}

type StoreDelegates = Omit<PrivacyStoreAdapter, 'name'>;

export class DelegatedPrivacyStoreAdapter implements PrivacyStoreAdapter {
  readonly name: StoreName;

  constructor(name: Exclude<StoreName, 'postgres'>, private readonly delegates: StoreDelegates) {
    const methods: (keyof StoreDelegates)[] = [
      'preflight',
      'previewRetention',
      'purgeRetention',
      'exportSubject',
      'anonymizeSubject',
      'eraseSubject',
    ];
    if (methods.some((method) => typeof delegates?.[method] !== 'function')) {
      throw new Error('Incomplete privacy adapter delegation');
    }
    this.name = name;
  }

  preflight(context: StoreOperationContext): Promise<void> {
    return this.delegates.preflight(context);
  }

  previewRetention(context: RetentionStoreContext): Promise<StorePreviewResult> {
    return this.delegates.previewRetention(context);
  }

  purgeRetention(context: RetentionStoreContext): Promise<StoreMutationResult> {
    return this.delegates.purgeRetention(context);
  }

  exportSubject(context: SubjectStoreContext): Promise<unknown> {
    return this.delegates.exportSubject(context);
  }

  anonymizeSubject(context: SubjectStoreContext): Promise<StoreMutationResult> {
    return this.delegates.anonymizeSubject(context);
  }

  eraseSubject(context: SubjectStoreContext): Promise<StoreMutationResult> {
    return this.delegates.eraseSubject(context);
  }
}

export class AttestedNoPersonalDataAdapter implements PrivacyStoreAdapter {
  readonly name: StoreName;

  constructor(name: Exclude<StoreName, 'postgres'>, private readonly attestationId: string) {
    if (!attestationId.trim()) {
      throw new Error('A data inventory attestation is required for a no-personal-data adapter');
    }
    this.name = name;
  }

  async preflight(_context: StoreOperationContext): Promise<void> {}

  async previewRetention(_context: RetentionStoreContext): Promise<StorePreviewResult> {
    return { matched: 0 };
  }

  async purgeRetention(_context: RetentionStoreContext): Promise<StoreMutationResult> {
    return { affected: 0 };
  }

  async exportSubject(_context: SubjectStoreContext): Promise<unknown> {
    return { applicable: false, attestationId: this.attestationId };
  }

  async anonymizeSubject(_context: SubjectStoreContext): Promise<StoreMutationResult> {
    return { affected: 0 };
  }

  async eraseSubject(_context: SubjectStoreContext): Promise<StoreMutationResult> {
    return { affected: 0 };
  }
}

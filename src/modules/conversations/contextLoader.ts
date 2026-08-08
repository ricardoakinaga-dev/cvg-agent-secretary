import { redisClient } from '../../shared/redis';
import { logger } from '../logging';
import { config } from '../../config';
import {
  ConversationContext,
  ConversationMetadata,
  NormalizedMessage,
  ConversationState,
} from '../../shared/types';
import { conversationRepository, ConversationControlState } from './repository';
import { contactRepository } from '../contacts/repository';
import { Contact } from '../contacts/types';
import { petRepository } from '../pets/repository';
import { Pet } from '../pets/types';
import { memoryRepository } from '../memory/repository';
import { handoffRepository } from '../handoff/repository';
import { metrics, METRICS } from '../../shared/metrics';

const EXPIRED_HANDOFF_RESOLUTION = 'Handoff expirado; automacao continua bloqueada ate resolucao humana';
export const MAX_CONTEXT_MESSAGES = 50;

/**
 * Extended context that includes memory information (for LLM context)
 */
export interface MemoryContext {
  contactId: string;
  contactName: string;
  memories: string[];
  pets: Array<{
    id: string;
    name: string;
    species: string;
    breed: string | null;
  }>;
}

/**
 * Load conversation context from Redis
 */
export async function loadConversationContext(
  conversationId: string,
  chatwootConversationId: number,
  contactId: string,
  chatwootContactId: number,
  contactName: string,
  inboxId: number,
  accountId: number
): Promise<ConversationContext> {
  logger.info('Loading conversation context', { conversationId });

  // PostgreSQL is authoritative for handoff/control state. A Redis miss or
  // stale cache must never reopen automation while a human owns the case.
  const control = await conversationRepository.getControlState(conversationId);

  // Redis is only a cache. Always load the durable conversation and recent
  // messages so a stale snapshot cannot hide an inbound or intake update.
  const existingState = await redisClient.getConversationState(conversationId);
  const persistedConversation = await conversationRepository.findById(conversationId);
  const persistedMessages = await conversationRepository.listMessages(conversationId, 50);

  if (existingState) {
    logger.info('Found existing conversation state', { conversationId });
    const cachedMessages = normalizeCachedMessages(existingState.messages, {
      conversationId,
      chatwootConversationId,
      contactId,
      chatwootContactId,
      senderName: contactName,
    });
    const messages = mergeMessages(cachedMessages, persistedMessages.map((message) => ({
      messageId: message.id,
      chatwootMessageId: message.chatwootMessageId,
      conversationId,
      chatwootConversationId,
      contactId,
      chatwootContactId,
      content: message.content,
      messageType: message.messageType,
      senderType: message.senderType,
      senderName: message.senderName || contactName,
      timestamp: message.createdAt,
      attachments: [],
    })));
    const cachedMetadata = normalizeMetadata(
      existingState.metadata as Partial<ConversationMetadata>,
      inboxId,
      accountId
    );
    const context: ConversationContext = {
      conversationId,
      chatwootConversationId,
      contactId,
      chatwootContactId,
      contactName,
      messages,
      metadata: {
        ...cachedMetadata,
        messageCount: Math.max(cachedMetadata.messageCount, messages.length),
        lastMessageAt: latestMessageAt(messages, cachedMetadata.lastMessageAt),
        contactIntake: persistedConversation?.contactIntake || cachedMetadata.contactIntake,
      },
      state: (existingState.state as ConversationState) || 'in_progress',
    };
    if (control && context.metadata.controlVersion !== undefined
      && context.metadata.controlVersion !== control.version) {
      metrics.incrementCounter(METRICS.CONTEXT_VERSION_CONFLICTS_TOTAL);
    }
    applyControlState(context, control);
    const cachedMessageCount = Array.isArray(existingState.messages)
      ? existingState.messages.length
      : 0;
    if (messages.length !== cachedMessageCount
      || context.metadata.controlVersion !== cachedMetadata.controlVersion
      || context.metadata.contactIntake !== cachedMetadata.contactIntake) {
      await saveConversationContext(context);
    }
    return context;
  }

  // Create new context
  const newContext: ConversationContext = {
    conversationId,
    chatwootConversationId,
    contactId,
    chatwootContactId,
    contactName,
    messages: persistedMessages.map((message) => ({
      messageId: message.id,
      chatwootMessageId: message.chatwootMessageId,
      conversationId,
      chatwootConversationId,
      contactId,
      chatwootContactId,
      content: message.content,
      messageType: message.messageType,
      senderType: message.senderType,
      senderName: message.senderName || contactName,
      timestamp: message.createdAt,
      attachments: [],
    })),
    metadata: {
      startedAt: new Date(),
      messageCount: persistedMessages.length,
      lastMessageAt: persistedMessages.at(-1)?.createdAt || new Date(),
      inboxId,
      accountId,
      contactIntake: persistedConversation?.contactIntake,
    },
    state: 'new',
  };
  applyControlState(newContext, control);

  // Save initial state
  await saveConversationContext(newContext);

  logger.info('Created new conversation context', { conversationId });
  return newContext;
}

/**
 * Save conversation context to Redis
 */
export async function saveConversationContext(context: ConversationContext): Promise<void> {
  context.messages = context.messages
    .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
    .slice(-MAX_CONTEXT_MESSAGES);
  await redisClient.setConversationState(context.conversationId, {
    conversationId: context.conversationId,
    chatwootConversationId: context.chatwootConversationId,
    contactId: context.contactId,
    chatwootContactId: context.chatwootContactId,
    contactName: context.contactName,
    messages: context.messages,
    metadata: context.metadata,
    state: context.state,
  });
}

/**
 * Add message to conversation context
 */
export async function addMessageToContext(
  context: ConversationContext,
  message: NormalizedMessage
): Promise<ConversationContext> {
  const alreadyPresent = context.messages.some(
    (existing) => existing.chatwootMessageId === message.chatwootMessageId
  );
  if (!alreadyPresent) context.messages.push(message);
  context.messages = context.messages
    .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
    .slice(-MAX_CONTEXT_MESSAGES);

  // Update metadata
  if (!alreadyPresent) {
    context.metadata.messageCount += 1;
    context.metadata.lastMessageAt = latestMessageAt(context.messages, context.metadata.lastMessageAt);
  }

  // Update state
  if (context.state === 'new') {
    context.state = 'in_progress';
  }

  // Save to Redis
  await saveConversationContext(context);

  // Also append new messages to the auxiliary Redis list. A retry for an
  // already persisted Chatwoot message must not duplicate that list even
  // though the durable context write above is idempotent.
  if (!alreadyPresent) {
    await redisClient.appendMessageToConversation(context.conversationId, {
      ...message,
      timestamp: message.timestamp.toISOString(),
    });
  }

  return context;
}

/**
 * Get conversation messages formatted for OpenAI
 */
export function formatConversationHistory(messages: NormalizedMessage[]): string[] {
  return messages.map((msg) => {
    const sender = msg.senderType === 'user' ? msg.senderName : 'Atendente';
    return `${sender}: ${msg.content}`;
  });
}

/**
 * Check if conversation is in a state that should be processed
 */
export function shouldProcessConversation(context: ConversationContext): boolean {
  // Don't process if already handed off or completed
  if (context.state === 'handoff' || context.state === 'completed' || context.state === 'failed') {
    return false;
  }

  return true;
}

export function isHandoffExpired(
  context: ConversationContext,
  now: Date = new Date()
): boolean {
  if (context.state !== 'handoff') {
    return false;
  }

  // Expiration is a durable observation. It must not be reprocessed on every
  // sweep, and it never grants permission to resume automation.
  if (context.metadata.handoffExpiredAt) {
    return false;
  }

  if (!context.metadata.handoffUntil) {
    return true;
  }

  const handoffUntil = new Date(context.metadata.handoffUntil);
  if (Number.isNaN(handoffUntil.getTime())) {
    return true;
  }

  return handoffUntil.getTime() <= now.getTime();
}

export async function resetExpiredHandoff(
  context: ConversationContext,
  now: Date = new Date()
): Promise<boolean> {
  if (!isHandoffExpired(context, now)) {
    return false;
  }

  // Persist the expiration before changing the cache. If this write fails,
  // keeping Redis in handoff makes the next sweep retry safely. Automation is
  // deliberately kept blocked; only an authenticated operator can resume it.
  const controlBeforeExpiry = await conversationRepository.getControlState(context.conversationId);
  if (controlBeforeExpiry && !['handoff_pending', 'handoff_active'].includes(controlBeforeExpiry.state)) {
    return false;
  }
  if (controlBeforeExpiry?.handoffExpiredAt) {
    return false;
  }
  await handoffRepository.cancelPendingByConversation(
    context.conversationId,
    EXPIRED_HANDOFF_RESOLUTION
  );
  const control = await conversationRepository.setControlState(
    context.conversationId,
    'handoff_active',
    {
      handoffUntil: null,
      handoffExpiredAt: now,
      handoffReason: EXPIRED_HANDOFF_RESOLUTION,
      expectedVersion: controlBeforeExpiry?.version,
    }
  );

  logger.info('Handoff expired; automation remains blocked until operator resolution', {
    conversationId: context.conversationId,
    handoffStartedAt: context.metadata.handoffStartedAt,
    handoffUntil: context.metadata.handoffUntil,
  });

  context.state = 'handoff';
  context.metadata.controlVersion = control.version;
  context.metadata.handoffExpiredAt = now.toISOString();
  delete context.metadata.handoffUntil;
  context.metadata.handoffReason = EXPIRED_HANDOFF_RESOLUTION;
  await saveConversationContext(context);

  return true;
}

export async function sweepExpiredHandoffs(now: Date = new Date()): Promise<number> {
  const states = await redisClient.listConversationStates();
  let cleaned = 0;

  for (const entry of states) {
    const state = entry.state.state;
    const chatwootConversationId = entry.state.chatwootConversationId;

    if (state !== 'handoff' || typeof chatwootConversationId !== 'number') {
      continue;
    }

    const context: ConversationContext = {
      conversationId: typeof entry.state.conversationId === 'string'
        ? entry.state.conversationId
        : entry.conversationId,
      chatwootConversationId,
      contactId: typeof entry.state.contactId === 'string' ? entry.state.contactId : 'unknown',
      chatwootContactId: typeof entry.state.chatwootContactId === 'number' ? entry.state.chatwootContactId : 0,
      contactName: typeof entry.state.contactName === 'string' ? entry.state.contactName : 'Cliente',
      messages: Array.isArray(entry.state.messages) ? entry.state.messages as NormalizedMessage[] : [],
      metadata: entry.state.metadata as ConversationMetadata,
      state: 'handoff',
    };

    if (await resetExpiredHandoff(context, now)) {
      cleaned += 1;
    }
  }

  if (cleaned > 0) {
    logger.info('Expired handoff sweep completed', { cleaned });
  }

  return cleaned;
}

/**
 * Update conversation state
 */
export async function updateConversationState(
  context: ConversationContext,
  newState: ConversationState,
  options: {
    reason?: string;
    now?: Date;
    handoffTimeoutMinutes?: number;
    controlState?: ConversationControlState;
  } = {}
): Promise<void> {
  logger.info('Updating conversation state', {
    conversationId: context.conversationId,
    from: context.state,
    to: newState,
  });

  context.state = newState;

  if (newState === 'handoff') {
    const now = options.now || new Date();
    const handoffTimeoutMinutes = options.handoffTimeoutMinutes || config.conversation.handoffTimeoutMinutes;
    const handoffUntil = new Date(now.getTime() + handoffTimeoutMinutes * 60 * 1000);

    context.metadata.handoffStartedAt = now.toISOString();
    context.metadata.handoffUntil = handoffUntil.toISOString();
    context.metadata.handoffReason = options.reason;
  } else {
    delete context.metadata.handoffStartedAt;
    delete context.metadata.handoffUntil;
    delete context.metadata.handoffReason;
  }

  const controlState = options.controlState
    || (newState === 'handoff'
      ? 'handoff_active'
      : newState === 'completed' ? 'completed' : 'automated');
  const expectedVersion = Number.isSafeInteger(context.metadata.controlVersion)
    ? context.metadata.controlVersion
    : undefined;
  const control = await conversationRepository.setControlState(context.conversationId, controlState, {
    handoffUntil: context.metadata.handoffUntil ? new Date(context.metadata.handoffUntil) : null,
    handoffExpiredAt: null,
    handoffReason: context.metadata.handoffReason || null,
    expectedVersion,
  });
  context.metadata.controlVersion = control.version;
  delete context.metadata.handoffExpiredAt;
  await saveConversationContext(context);
}

function normalizeMetadata(
  value: Partial<ConversationMetadata> | undefined,
  inboxId: number,
  accountId: number
): ConversationMetadata {
  const messageCount = value?.messageCount;
  const startedAt = value?.startedAt instanceof Date
    ? value.startedAt
    : new Date(String(value?.startedAt || new Date().toISOString()));
  const lastMessageAt = value?.lastMessageAt instanceof Date
    ? value.lastMessageAt
    : new Date(String(value?.lastMessageAt || startedAt.toISOString()));
  return {
    startedAt: Number.isNaN(startedAt.getTime()) ? new Date() : startedAt,
    messageCount: Number.isInteger(messageCount) && (messageCount || 0) >= 0
      ? messageCount || 0
      : 0,
    lastMessageAt: Number.isNaN(lastMessageAt.getTime()) ? new Date() : lastMessageAt,
    inboxId: value?.inboxId || inboxId,
    accountId: value?.accountId || accountId,
    handoffStartedAt: value?.handoffStartedAt,
    handoffUntil: value?.handoffUntil,
    handoffExpiredAt: value?.handoffExpiredAt,
    handoffReason: value?.handoffReason,
    contactIntake: value?.contactIntake,
    controlVersion: Number.isInteger(value?.controlVersion) && (value?.controlVersion || 0) >= 0
      ? value?.controlVersion
      : undefined,
  };
}

function applyControlState(
  context: ConversationContext,
  control: Awaited<ReturnType<typeof conversationRepository.getControlState>>
): void {
  if (!control) return;
  context.metadata.controlVersion = control.version;
  context.metadata.handoffExpiredAt = control.handoffExpiredAt?.toISOString();
  if (control.state === 'completed') {
    context.state = 'completed';
    delete context.metadata.handoffStartedAt;
    delete context.metadata.handoffUntil;
    delete context.metadata.handoffReason;
    return;
  }
  if (control.state === 'handoff_pending' || control.state === 'handoff_active') {
    context.state = 'handoff';
    context.metadata.handoffUntil = control.handoffUntil?.toISOString();
    context.metadata.handoffReason = control.handoffReason || undefined;
    if (!context.metadata.handoffStartedAt) {
      context.metadata.handoffStartedAt = control.updatedAt.toISOString();
    }
    return;
  }
  if (control.state === 'automated' && context.state === 'handoff') {
    context.state = 'in_progress';
    delete context.metadata.handoffStartedAt;
    delete context.metadata.handoffUntil;
    delete context.metadata.handoffExpiredAt;
    delete context.metadata.handoffReason;
  }
}

function latestMessageAt(messages: NormalizedMessage[], fallback: Date): Date {
  const latest = messages.at(-1)?.timestamp;
  return latest && latest.getTime() > fallback.getTime() ? latest : fallback;
}

function mergeMessages(
  cached: NormalizedMessage[],
  persisted: NormalizedMessage[]
): NormalizedMessage[] {
  const byMessageId = new Map<string, NormalizedMessage>();
  for (const message of cached) {
    byMessageId.set(String(message.chatwootMessageId || message.messageId), message);
  }
  // Durable messages win over stale cache content for the same Chatwoot ID.
  for (const message of persisted) {
    byMessageId.set(String(message.chatwootMessageId || message.messageId), message);
  }
  return [...byMessageId.values()]
    .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
    .slice(-MAX_CONTEXT_MESSAGES);
}

function normalizeCachedMessages(
  value: unknown,
  defaults: Pick<NormalizedMessage, 'conversationId' | 'chatwootConversationId' | 'contactId' | 'chatwootContactId' | 'senderName'>
): NormalizedMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const message = candidate as Partial<NormalizedMessage>;
    const chatwootMessageId = Number(message.chatwootMessageId);
    const timestamp = new Date(String(message.timestamp || ''));
    if (!Number.isSafeInteger(chatwootMessageId) || chatwootMessageId < 1 || Number.isNaN(timestamp.getTime())) {
      return [];
    }
    const senderType = message.senderType === 'agent' || message.senderType === 'bot'
      ? message.senderType
      : 'user';
    const messageType = message.messageType === 'outgoing' || message.messageType === 'system'
      ? message.messageType
      : 'incoming';
    return [{
      messageId: String(message.messageId || chatwootMessageId),
      chatwootMessageId,
      ...defaults,
      content: typeof message.content === 'string' ? message.content : '',
      messageType,
      senderType,
      senderName: typeof message.senderName === 'string' ? message.senderName : defaults.senderName,
      timestamp,
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
    }];
  });
}

/**
 * Load contact and memory for context (Phase 2)
 */
export async function loadContactAndMemories(
  chatwootContactId: number,
  contactName: string
): Promise<{
  contactId: string | null;
  contact: Contact | null;
  memories: string[];
  pets: Pet[];
}> {
  try {
    // Try to find existing contact by chatwoot_id
    let contact = await contactRepository.find({ chatwootId: chatwootContactId });
    
    // If still not found, create a new contact
    if (!contact) {
      contact = await contactRepository.create({
        chatwootId: chatwootContactId,
        name: contactName,
        preferredChannel: 'chatwoot',
      });
      logger.info('Created new contact from conversation', { 
        contactId: contact.id, 
        chatwootContactId 
      });
    }
    
    // Load memories for this contact
    const memories = await memoryRepository.getContextForLLM(contact.id);
    
    // Load pets for this contact
    const pets = await petRepository.find({ contactId: contact.id });
    
    return {
      contactId: contact.id,
      contact: contact,
      memories,
      pets,
    };
  } catch (error) {
    logger.error('Error loading contact and memories', error as Error, { 
      chatwootContactId 
    });
    return {
      contactId: null,
      contact: null,
      memories: [],
      pets: [],
    };
  }
}

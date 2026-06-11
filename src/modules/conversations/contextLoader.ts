import { redisClient } from '../../shared/redis';
import { logger } from '../logging';
import { config } from '../../config';
import {
  ConversationContext,
  ConversationMetadata,
  NormalizedMessage,
  ConversationState,
} from '../../shared/types';
import { contactRepository } from '../contacts/repository';
import { Contact } from '../contacts/types';
import { petRepository } from '../pets/repository';
import { Pet } from '../pets/types';
import { memoryRepository } from '../memory/repository';

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

  // Try to get existing state
  const existingState = await redisClient.getConversationState(conversationId);

  if (existingState) {
    logger.info('Found existing conversation state', { conversationId });
    return {
      conversationId,
      chatwootConversationId,
      contactId,
      chatwootContactId,
      contactName,
      messages: (existingState.messages as NormalizedMessage[]) || [],
      metadata: existingState.metadata as ConversationMetadata,
      state: (existingState.state as ConversationState) || 'in_progress',
    };
  }

  // Create new context
  const newContext: ConversationContext = {
    conversationId,
    chatwootConversationId,
    contactId,
    chatwootContactId,
    contactName,
    messages: [],
    metadata: {
      startedAt: new Date(),
      messageCount: 0,
      lastMessageAt: new Date(),
      inboxId,
      accountId,
    },
    state: 'new',
  };

  // Save initial state
  await saveConversationContext(newContext);

  logger.info('Created new conversation context', { conversationId });
  return newContext;
}

/**
 * Save conversation context to Redis
 */
export async function saveConversationContext(context: ConversationContext): Promise<void> {
  await redisClient.setConversationState(context.conversationId, {
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
  // Add to messages array
  context.messages.push(message);

  // Update metadata
  context.metadata.messageCount += 1;
  context.metadata.lastMessageAt = new Date();

  // Update state
  if (context.state === 'new') {
    context.state = 'in_progress';
  }

  // Save to Redis
  await saveConversationContext(context);

  // Also append to message list for easier retrieval
  await redisClient.appendMessageToConversation(context.conversationId, {
    ...message,
    timestamp: message.timestamp.toISOString(),
  });

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

  logger.info('Handoff expired, resuming automation', {
    conversationId: context.conversationId,
    handoffStartedAt: context.metadata.handoffStartedAt,
    handoffUntil: context.metadata.handoffUntil,
  });

  context.state = 'in_progress';
  delete context.metadata.handoffStartedAt;
  delete context.metadata.handoffUntil;
  delete context.metadata.handoffReason;
  await saveConversationContext(context);
  return true;
}

/**
 * Update conversation state
 */
export async function updateConversationState(
  context: ConversationContext,
  newState: ConversationState,
  options: { reason?: string; now?: Date; handoffTimeoutMinutes?: number } = {}
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

  await saveConversationContext(context);
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
    
    // If not found, try by name (less reliable)
    if (!contact) {
      contact = await contactRepository.find({ name: contactName });
    }
    
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

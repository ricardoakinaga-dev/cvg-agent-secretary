import {
  normalizeMessage,
  isRelevantEvent,
  extractConversationMetadata,
  normalizeChatwootMessageType,
} from '../../src/modules/chatwoot/normalizer';
import { ChatwootWebhookPayload } from '../../src/shared/types';

// Mock payload for testing
const createMockPayload = (overrides: Partial<ChatwootWebhookPayload> = {}): ChatwootWebhookPayload => ({
  event: 'message_created',
  id: 1234567890,
  conversation: {
    id: 12345,
    uuid: 'conversation-uuid-123',
    account_id: 1,
    inbox_id: 2,
    status: 'open',
    assignee_id: null,
    contact: {
      id: 67890,
      name: 'Maria Santos',
      email: 'maria@email.com',
      phone_number: '+5511999999999',
      identifier: 'external_id_123',
    },
  },
  message: {
    id: 1111111111,
    content: 'Olá, bom dia! Gostaria de informações sobre horário de atendimento.',
    message_type: 'incoming',
    sender: {
      id: 67890,
      name: 'Maria Santos',
      type: 'contact',
    },
    attachments: [],
    private: false,
  },
  ...overrides,
});

describe('Chatwoot Normalizer', () => {
  describe('normalizeChatwootMessageType', () => {
    it('should normalize string and numeric Chatwoot message types', () => {
      expect(normalizeChatwootMessageType('incoming')).toBe('incoming');
      expect(normalizeChatwootMessageType(0)).toBe('incoming');
      expect(normalizeChatwootMessageType('outgoing')).toBe('outgoing');
      expect(normalizeChatwootMessageType(1)).toBe('outgoing');
    });
  });

  describe('normalizeMessage', () => {
    it('should normalize a valid incoming message', () => {
      const payload = createMockPayload();
      const result = normalizeMessage(payload);

      expect(result).not.toBeNull();
      expect(result?.messageId).toBeDefined();
      expect(result?.chatwootMessageId).toBe(1111111111);
      expect(result?.conversationId).toBe('conversation-uuid-123');
      expect(result?.chatwootConversationId).toBe(12345);
      expect(result?.contactId).toBe('67890');
      expect(result?.chatwootContactId).toBe(67890);
      expect(result?.content).toBe('Olá, bom dia! Gostaria de informações sobre horário de atendimento.');
      expect(result?.messageType).toBe('incoming');
      expect(result?.senderType).toBe('user');
      expect(result?.senderName).toBe('Maria Santos');
      expect(result?.attachments).toEqual([]);
    });

    it('should return null for outgoing messages', () => {
      const payload = createMockPayload({
        message: {
          id: 1111111111,
          content: 'Response from agent',
          message_type: 'outgoing',
          sender: { id: 1, name: 'Agent', type: 'agent' },
          attachments: [],
          private: false,
        },
      });

      const result = normalizeMessage(payload);
      expect(result).toBeNull();
    });

    it('should normalize incoming messages even when Chatwoot sender type is user', () => {
      const payload = createMockPayload({
        message: {
          id: 1111111111,
          content: 'Incoming webhook with user sender type',
          message_type: 'incoming',
          sender: { id: 1, name: 'Cliente no webhook', type: 'user' },
          attachments: [],
          private: false,
        },
      });

      const result = normalizeMessage(payload);
      expect(result).not.toBeNull();
      expect(result?.content).toBe('Incoming webhook with user sender type');
    });

    it('should normalize numeric incoming messages from contacts', () => {
      const payload = createMockPayload({
        message: {
          id: 1111111111,
          content: 'Mensagem numérica do Chatwoot',
          message_type: 0,
          sender: { id: 67890, name: 'Maria Santos', type: 'contact' },
          attachments: [],
          private: false,
        },
      });

      const result = normalizeMessage(payload);
      expect(result).not.toBeNull();
      expect(result?.content).toBe('Mensagem numérica do Chatwoot');
    });

    it('should return null for private messages', () => {
      const payload = createMockPayload({
        message: {
          id: 1111111111,
          content: 'Private note',
          message_type: 'incoming',
          sender: { id: 67890, name: 'Maria Santos', type: 'contact' },
          attachments: [],
          private: true,
        },
      });

      const result = normalizeMessage(payload);
      expect(result).toBeNull();
    });

    it('should return null when message is missing', () => {
      const payload = createMockPayload({ message: undefined });

      const result = normalizeMessage(payload);
      expect(result).toBeNull();
    });

    it('should handle message with attachments', () => {
      const payload = createMockPayload({
        message: {
          id: 1111111111,
          content: 'Message with attachment',
          message_type: 'incoming',
          sender: { id: 67890, name: 'Maria Santos', type: 'contact' },
          attachments: [
            {
              id: 1,
              filename: 'image.jpg',
              content_type: 'image/jpeg',
              file_url: 'https://example.com/image.jpg',
            },
          ],
          private: false,
        },
      });

      const result = normalizeMessage(payload);
      expect(result).not.toBeNull();
      expect(result?.attachments).toHaveLength(1);
      expect(result?.attachments[0].fileName).toBe('image.jpg');
    });
  });

  describe('isRelevantEvent', () => {
    it('should return true for message_created with incoming message', () => {
      const payload = createMockPayload();
      expect(isRelevantEvent(payload)).toBe(true);
    });

    it('should return false for conversation_created event', () => {
      const payload = createMockPayload({ event: 'conversation_created' });
      expect(isRelevantEvent(payload)).toBe(false);
    });

    it('should return false for outgoing messages', () => {
      const payload = createMockPayload({
        message: {
          id: 1111111111,
          content: 'Outgoing message',
          message_type: 'outgoing',
          sender: { id: 1, name: 'Agent', type: 'agent' },
          attachments: [],
          private: false,
        },
      });

      expect(isRelevantEvent(payload)).toBe(false);
    });

    it('should return true for incoming messages even when Chatwoot sender type is user', () => {
      const payload = createMockPayload({
        message: {
          id: 1111111111,
          content: 'Incoming webhook with user sender type',
          message_type: 'incoming',
          sender: { id: 1, name: 'Cliente no webhook', type: 'user' },
          attachments: [],
          private: false,
        },
      });

      expect(isRelevantEvent(payload)).toBe(true);
    });

    it('should return false for private messages', () => {
      const payload = createMockPayload({
        message: {
          id: 1111111111,
          content: 'Private message',
          message_type: 'incoming',
          sender: { id: 67890, name: 'Maria Santos', type: 'contact' },
          attachments: [],
          private: true,
        },
      });

      expect(isRelevantEvent(payload)).toBe(false);
    });
  });

  describe('extractConversationMetadata', () => {
    it('should extract conversation metadata correctly', () => {
      const payload = createMockPayload();
      const result = extractConversationMetadata(payload);

      expect(result.conversationId).toBe('conversation-uuid-123');
      expect(result.chatwootConversationId).toBe(12345);
      expect(result.contactId).toBe('67890');
      expect(result.chatwootContactId).toBe(67890);
      expect(result.contactName).toBe('Maria Santos');
      expect(result.inboxId).toBe(2);
      expect(result.accountId).toBe(1);
      expect(result.status).toBe('open');
    });
  });
});

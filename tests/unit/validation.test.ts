import { describe, it, expect } from 'vitest';
import { 
  validateInput, 
  ContactSchema, 
  MemorySchema, 
  PetSchema,
  ChatwootWebhookSchema,
  MEMORY_CATEGORIES,
  PET_SPECIES
} from '../../src/modules/validation/schemas';

describe('Validation Schemas', () => {
  describe('ContactSchema', () => {
    it('should validate valid contact input', () => {
      const input = {
        name: 'João Silva',
        email: 'joao@email.com',
        phone: '11999999999',
      };
      
      const result = validateInput(ContactSchema, input);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({
        name: 'João Silva',
        email: 'joao@email.com',
      }));
    });

    it('should reject invalid email', () => {
      const input = {
        name: 'João Silva',
        email: 'invalid-email',
      };
      
      const result = validateInput(ContactSchema, input);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject empty name', () => {
      const input = {
        name: '',
        email: 'joao@email.com',
      };
      
      const result = validateInput(ContactSchema, input);
      
      expect(result.success).toBe(false);
    });

    it('should accept optional fields', () => {
      const input = {
        name: 'João Silva',
      };
      
      const result = validateInput(ContactSchema, input);
      
      expect(result.success).toBe(true);
    });
  });

  describe('MemorySchema', () => {
    it('should validate valid memory input', () => {
      const input = {
        contactId: '123e4567-e89b-12d3-a456-426614174000',
        category: 'preference',
        key: 'gosta_de',
        value: 'banho',
        confidence: 0.9,
        source: 'conversation',
      };
      
      const result = validateInput(MemorySchema, input);
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid category', () => {
      const input = {
        contactId: '123e4567-e89b-12d3-a456-426614174000',
        category: 'invalid_category',
        key: 'test',
        value: 'test',
        confidence: 0.9,
        source: 'conversation',
      };
      
      const result = validateInput(MemorySchema, input);
      
      expect(result.success).toBe(false);
    });

    it('should reject confidence > 1', () => {
      const input = {
        contactId: '123e4567-e89b-12d3-a456-426614174000',
        category: 'preference',
        key: 'test',
        value: 'test',
        confidence: 1.5,
        source: 'conversation',
      };
      
      const result = validateInput(MemorySchema, input);
      
      expect(result.success).toBe(false);
    });

    it('should reject confidence < 0', () => {
      const input = {
        contactId: '123e4567-e89b-12d3-a456-426614174000',
        category: 'preference',
        key: 'test',
        value: 'test',
        confidence: -0.1,
        source: 'conversation',
      };
      
      const result = validateInput(MemorySchema, input);
      
      expect(result.success).toBe(false);
    });

    it('should have valid categories', () => {
      expect(MEMORY_CATEGORIES).toContain('preference');
      expect(MEMORY_CATEGORIES).toContain('fact');
      expect(MEMORY_CATEGORIES).toContain('history');
    });
  });

  describe('PetSchema', () => {
    it('should validate valid pet input', () => {
      const input = {
        contactId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Rex',
        species: 'cachorro',
        breed: 'Labrador',
      };
      
      const result = validateInput(PetSchema, input);
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid species', () => {
      const input = {
        contactId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Rex',
        species: 'unicorn',
      };
      
      const result = validateInput(PetSchema, input);
      
      expect(result.success).toBe(false);
    });

    it('should reject negative weight', () => {
      const input = {
        contactId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Rex',
        species: 'cachorro',
        weight: -5,
      };
      
      const result = validateInput(PetSchema, input);
      
      expect(result.success).toBe(false);
    });

    it('should have valid species', () => {
      expect(PET_SPECIES).toContain('cachorro');
      expect(PET_SPECIES).toContain('gato');
    });
  });

  describe('ChatwootWebhookSchema', () => {
    it('should validate valid webhook payload', () => {
      const input = {
        event: 'message_created',
        conversation: {
          id: 123,
          uuid: 'conv-uuid-123',
          account_id: 1,
          inbox_id: 2,
          status: 'open',
          contact: {
            id: 456,
            name: 'John Doe',
            email: 'john@example.com',
          },
        },
        message: {
          id: 789,
          content: 'Hello',
          message_type: 0,
          sender: {
            id: 456,
            name: 'John Doe',
            type: 'contact',
          },
        },
      };
      
      const result = validateInput(ChatwootWebhookSchema, input);
      
      expect(result.success).toBe(true);
    });

    it('accepts nullable optional contact fields emitted by Chatwoot', () => {
      const input = {
        event: 'message_created',
        conversation: {
          id: 123,
          account_id: 1,
          inbox_id: 2,
          status: 'open',
          meta: {
            sender: {
              id: 456,
              name: 'John Doe',
              email: null,
              phone_number: null,
              identifier: null,
            },
          },
        },
        message: {
          id: 789,
          content: 'Hello',
          message_type: 0,
          sender: { id: 456, name: 'John Doe', type: 'contact' },
        },
      };

      expect(validateInput(ChatwootWebhookSchema, input).success).toBe(true);
    });

    it('accepts flat incoming webhooks whose top-level sender omits type', () => {
      const input = {
        event: 'message_created',
        id: 789,
        content: 'Hello',
        message_type: 'incoming',
        private: false,
        account: { id: 1, name: 'Veterinary clinic' },
        conversation: {
          id: 123,
          account_id: 1,
          inbox_id: 2,
          status: 'open',
          meta: {
            sender: {
              id: 456,
              name: 'John Doe',
            },
          },
        },
        sender: {
          id: 456,
          name: 'John Doe',
        },
      };

      expect(validateInput(ChatwootWebhookSchema, input).success).toBe(true);
    });

    it('should reject invalid event type', () => {
      const input = {
        event: 'invalid_event',
        conversation: {
          id: 123,
          uuid: 'conv-uuid-123',
          account_id: 1,
          inbox_id: 2,
          status: 'open',
          contact: {
            id: 456,
            name: 'John Doe',
          },
        },
      };
      
      const result = validateInput(ChatwootWebhookSchema, input);
      
      expect(result.success).toBe(false);
    });

    it('requires an account for message events', () => {
      const input = {
        event: 'message_created',
        conversation: {
          id: 123,
          inbox_id: 2,
          status: 'open',
          contact: { id: 456, name: 'John Doe' },
        },
        message: {
          id: 789,
          content: 'Hello',
          message_type: 'incoming',
          sender: { id: 456, name: 'John Doe', type: 'contact' },
        },
      };

      expect(validateInput(ChatwootWebhookSchema, input).success).toBe(false);
    });

    it('requires the sender for message events', () => {
      const input = {
        event: 'message_created',
        conversation: {
          id: 123,
          account_id: 1,
          inbox_id: 2,
          status: 'open',
          contact: { id: 456, name: 'John Doe' },
        },
        message: {
          id: 789,
          content: 'Hello',
          message_type: 'incoming',
        },
      };

      expect(validateInput(ChatwootWebhookSchema, input).success).toBe(false);
    });

    it('strips unknown fields at every retained payload level', () => {
      const input = {
        event: 'message_created',
        unexpectedRoot: 'secret passthrough',
        conversation: {
          id: 123,
          account_id: 1,
          inbox_id: 2,
          status: 'open',
          unexpectedConversation: 'remove me',
          contact: {
            id: 456,
            name: 'John Doe',
            unexpectedContact: 'remove me',
          },
        },
        message: {
          id: 789,
          content: 'Hello',
          message_type: 0,
          unexpectedMessage: 'remove me',
          sender: {
            id: 456,
            name: 'John Doe',
            type: 'contact',
            unexpectedSender: 'remove me',
          },
        },
      };

      const result = validateInput(ChatwootWebhookSchema, input);

      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('unexpectedRoot');
      expect(result.data?.conversation).not.toHaveProperty('unexpectedConversation');
      expect(result.data?.conversation.contact).not.toHaveProperty('unexpectedContact');
      expect(result.data?.message).not.toHaveProperty('unexpectedMessage');
      expect(result.data?.message?.sender).not.toHaveProperty('unexpectedSender');
    });

    it('rejects oversized message content and attachment arrays', () => {
      const base = {
        event: 'message_created',
        conversation: {
          id: 123,
          account_id: 1,
          inbox_id: 2,
          status: 'open',
          contact: { id: 456, name: 'John Doe' },
        },
        message: {
          id: 789,
          content: 'x'.repeat(10_001),
          message_type: 0,
          sender: { id: 456, name: 'John Doe', type: 'contact' },
          attachments: Array.from({ length: 11 }, (_, index) => ({
            id: index + 1,
            filename: `file-${index}.txt`,
            content_type: 'text/plain',
            file_url: 'https://example.com/file.txt',
          })),
        },
      };

      expect(validateInput(ChatwootWebhookSchema, base).success).toBe(false);
    });
  });
});

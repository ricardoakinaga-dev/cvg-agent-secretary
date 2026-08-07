const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db', () => ({ query: mockQuery }));

import { ConversationRepository } from '../../src/modules/conversations/repository';

describe('conversation repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts a conversation by its Chatwoot conversation id', async () => {
    const updatedAt = new Date('2026-07-10T12:00:00.000Z');
    mockQuery.mockResolvedValue({
      rows: [{
        id: 'persisted-conversation-1',
        chatwoot_conversation_id: '123',
        chatwoot_contact_id: '99',
        contact_name: 'Maria',
        status: 'open',
        contact_intake: {
          stage: 'ready',
          contactRole: 'cliente',
          contactReason: 'Consultar horários',
          unansweredAttempts: 0,
          updatedAt: '2026-08-02T00:00:00.000Z',
        },
        started_at: new Date('2026-07-10T11:00:00.000Z'),
        last_message_at: updatedAt,
      }],
    });

    const repository = new ConversationRepository();
    const conversation = await repository.upsertConversation({
      chatwootConversationId: 123,
      chatwootContactId: 99,
      contactName: 'Maria',
      status: 'open',
      lastMessageAt: updatedAt,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (tenant_id, chatwoot_conversation_id)'),
      ['1', 123, 99, 'Maria', 'open', updatedAt]
    );
    expect(conversation).toEqual(expect.objectContaining({
      id: 'persisted-conversation-1',
      chatwootConversationId: 123,
      chatwootContactId: 99,
      status: 'open',
      lastMessageAt: updatedAt,
      contactIntake: expect.objectContaining({
        stage: 'ready',
        contactRole: 'cliente',
      }),
    }));
  });

  it('stores masked message content idempotently', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 'message-1',
        conversation_id: 'persisted-conversation-1',
        chatwoot_message_id: '456',
        content: 'CPF ***.456.789-**, email m***@example.com, telefone +55**8888, cartão **** **** **** ****',
        message_type: 'incoming',
        sender_type: 'user',
        sender_name: 'Maria',
        created_at: new Date('2026-07-10T12:00:00.000Z'),
      }],
    });

    const repository = new ConversationRepository();
    const message = await repository.saveMessage({
      conversationId: 'persisted-conversation-1',
      chatwootMessageId: 456,
      content: 'CPF 123.456.789-01, email maria@example.com, telefone +55 (11) 99999-8888, cartão 1234 5678 9012 3456',
      messageType: 'incoming',
      senderType: 'user',
      senderName: 'Maria',
      createdAt: new Date('2026-07-10T12:00:00.000Z'),
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (tenant_id, conversation_id, chatwoot_message_id) DO NOTHING'),
      [
        '1',
        'persisted-conversation-1',
        456,
        'CPF ***.456.789-**, email m***@example.com, telefone +55**8888, cartão **** **** **** ****',
        'incoming',
        'user',
        'Maria',
        new Date('2026-07-10T12:00:00.000Z'),
      ]
    );
    expect(message?.chatwootMessageId).toBe(456);
  });

  it('returns null when the same Chatwoot message was already stored', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const repository = new ConversationRepository();
    const result = await repository.saveMessage({
      conversationId: 'persisted-conversation-1',
      chatwootMessageId: 456,
      content: 'mensagem repetida',
      messageType: 'incoming',
      senderType: 'user',
      senderName: 'Maria',
    });

    expect(result).toBeNull();
  });

  it('persists the structured intake by tenant while masking direct identifiers', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'persisted-conversation-1' }], rowCount: 1 });

    const repository = new ConversationRepository();
    await repository.updateContactIntake('persisted-conversation-1', {
      stage: 'ready',
      contactRole: 'fornecedor',
      contactReason: 'Entrega; retorno em (11) 99999-8888',
      reasonIntent: 'desconhecido',
      organization: 'Vet Supply',
      unansweredAttempts: 0,
      updatedAt: '2026-08-02T00:00:00.000Z',
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE conversations'),
      [
        '1',
        'persisted-conversation-1',
        expect.not.stringContaining('99999-8888'),
      ]
    );
  });

  it('fails when an intake update does not match the tenant conversation', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const repository = new ConversationRepository();
    await expect(repository.updateContactIntake('unknown-conversation', {
      stage: 'identification',
      unansweredAttempts: 1,
      updatedAt: '2026-08-02T00:00:00.000Z',
    })).rejects.toThrow('Conversation not found');
  });
});

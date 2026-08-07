const mockQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared/db', () => ({ query: mockQuery }));
vi.mock('../../src/config', () => ({
  config: { chatwoot: { accountId: '42' } },
}));
vi.mock('../../src/modules/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ConversationRepository } from '../../src/modules/conversations/repository';
import { ContactRepository } from '../../src/modules/contacts/repository';
import { PetRepository } from '../../src/modules/pets/repository';
import { MemoryRepository } from '../../src/modules/memory/repository';

const contactRow = {
  id: 'contact-1',
  tenant_id: '42',
  chatwoot_id: 7,
  name: 'Maria',
  email: null,
  phone: null,
  whatsapp: null,
  address: null,
  city: null,
  state: null,
  postal_code: null,
  cpf: null,
  preferred_channel: 'chatwoot',
  notes: null,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

const petRow = {
  id: 'pet-1',
  tenant_id: '42',
  chatwoot_id: 7,
  contact_id: 'contact-1',
  name: 'Bidu',
  species: 'cachorro',
  breed: null,
  birth_date: null,
  age_years: null,
  age_months: null,
  gender: null,
  weight: null,
  color: null,
  microchip: null,
  vaccination_status: null,
  medical_conditions: null,
  behavior_notes: null,
  photo_url: null,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

const memoryRow = {
  id: 'memory-1',
  tenant_id: '42',
  contact_id: 'contact-1',
  pet_id: null,
  conversation_id: null,
  category: 'preference',
  key: 'channel',
  value: { value: 'chatwoot' },
  confidence: 0.9,
  source: 'user_confirmed',
  is_active: true,
  last_confirmed_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
};

function expectTenantScopedCall(callIndex: number): void {
  const [sql, params] = mockQuery.mock.calls[callIndex] as [string, unknown[]];
  expect(sql).toMatch(/tenant_id\s*=\s*\$1|INSERT INTO [\s\S]+\(\s*tenant_id,/);
  expect(params[0]).toBe('42');
}

describe('tenant-scoped repositories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses account-scoped uniqueness for conversation and message writes', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{
        id: 'conversation-1',
        tenant_id: '42',
        chatwoot_conversation_id: '123',
        chatwoot_contact_id: '7',
        status: 'open',
        started_at: new Date(),
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'message-1',
        tenant_id: '42',
        conversation_id: 'conversation-1',
        chatwoot_message_id: '456',
        content: 'hello',
        message_type: 'incoming',
        sender_type: 'user',
        created_at: new Date(),
      }] });

    const repository = new ConversationRepository();
    const conversation = await repository.upsertConversation({
      chatwootConversationId: 123,
      chatwootContactId: 7,
      status: 'open',
    });
    const message = await repository.saveMessage({
      conversationId: 'conversation-1',
      chatwootMessageId: 456,
      content: 'hello',
      messageType: 'incoming',
      senderType: 'user',
    });

    expect(mockQuery.mock.calls[0][0]).toMatch(/ON CONFLICT \(tenant_id, chatwoot_conversation_id\)/);
    expect(mockQuery.mock.calls[0][1][0]).toBe('42');
    expect(mockQuery.mock.calls[1][0]).toMatch(/ON CONFLICT \(tenant_id, conversation_id, chatwoot_message_id\)/);
    expect(mockQuery.mock.calls[1][1][0]).toBe('42');
    expect(conversation.tenantId).toBe('42');
    expect(message?.tenantId).toBe('42');
  });

  it('scopes every contact read and write to the configured account', async () => {
    mockQuery.mockResolvedValue({ rows: [contactRow], rowCount: 1 });
    const repository = new ContactRepository();

    expect((await repository.find({ chatwootId: 7 }))?.tenantId).toBe('42');
    await repository.findById('contact-1');
    await repository.create({ chatwootId: 7, name: 'Maria' });
    await repository.update('contact-1', { name: 'Maria Silva' });
    await repository.delete('contact-1');

    for (let index = 0; index < mockQuery.mock.calls.length; index += 1) {
      expectTenantScopedCall(index);
    }
  });

  it('scopes every pet read and write to the configured account', async () => {
    mockQuery.mockResolvedValue({ rows: [petRow], rowCount: 1 });
    const repository = new PetRepository();

    expect((await repository.find({ contactId: 'contact-1' }))[0].tenantId).toBe('42');
    await repository.findById('pet-1');
    await repository.create({ contactId: 'contact-1', name: 'Bidu', species: 'cachorro' });
    await repository.update('pet-1', { name: 'Bidu II' });
    await repository.delete('pet-1');

    for (let index = 0; index < mockQuery.mock.calls.length; index += 1) {
      expectTenantScopedCall(index);
    }
  });

  it('scopes every memory read and write to the configured account', async () => {
    mockQuery.mockResolvedValue({ rows: [memoryRow], rowCount: 1 });
    const repository = new MemoryRepository();

    await repository.find({ contactId: 'contact-1' });
    await repository.findById('memory-1');
    await repository.create({
      contactId: 'contact-1',
      category: 'preference',
      key: 'channel',
      value: { value: 'chatwoot' },
      confidence: 0.9,
      source: 'user_confirmed',
    });
    await repository.update('memory-1', { confidence: 0.8 });
    await repository.deactivate('memory-1');

    for (let index = 0; index < mockQuery.mock.calls.length; index += 1) {
      expectTenantScopedCall(index);
    }
  });
});

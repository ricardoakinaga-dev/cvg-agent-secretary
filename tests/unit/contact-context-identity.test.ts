const contacts = vi.hoisted(() => ({
  find: vi.fn(),
  create: vi.fn(),
}));

const memories = vi.hoisted(() => ({ getContextForLLM: vi.fn() }));
const pets = vi.hoisted(() => ({ find: vi.fn() }));

vi.mock('../../src/modules/contacts/repository', () => ({ contactRepository: contacts }));
vi.mock('../../src/modules/memory/repository', () => ({ memoryRepository: memories }));
vi.mock('../../src/modules/pets/repository', () => ({ petRepository: pets }));
vi.mock('../../src/shared/redis', () => ({ redisClient: {} }));
vi.mock('../../src/modules/chatwoot/client', () => ({ chatwootClient: {} }));
vi.mock('../../src/modules/handoff/repository', () => ({ handoffRepository: {} }));
vi.mock('../../src/modules/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { loadContactAndMemories } from '../../src/modules/conversations/contextLoader';

describe('contact context identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memories.getContextForLLM.mockResolvedValue([]);
    pets.find.mockResolvedValue([]);
  });

  it('never associates a contact by name when the Chatwoot ID is unknown', async () => {
    contacts.find.mockResolvedValue(null);
    contacts.create.mockResolvedValue({ id: 'contact-new', chatwootId: 77, name: 'Same Name' });

    await loadContactAndMemories(77, 'Same Name');

    expect(contacts.find).toHaveBeenCalledOnce();
    expect(contacts.find).toHaveBeenCalledWith({ chatwootId: 77 });
    expect(contacts.create).toHaveBeenCalledWith({
      chatwootId: 77,
      name: 'Same Name',
      preferredChannel: 'chatwoot',
    });
  });
});

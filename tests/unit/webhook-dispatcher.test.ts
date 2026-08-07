import { ChatwootWebhookPayload } from '../../src/shared/types';

const runtime = vi.hoisted(() => ({
  processWebhookEvent: vi.fn(),
  processConversationCreated: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

const conversationRepository = vi.hoisted(() => ({
  upsertConversation: vi.fn(),
}));

vi.mock('../../src/modules/runtime/agentRuntime', () => runtime);
vi.mock('../../src/modules/analytics', () => ({ analyticsService: analytics }));
vi.mock('../../src/modules/conversations/repository', () => ({ conversationRepository }));

import { dispatchChatwootWebhook } from '../../src/modules/webhook/worker';

function payload(event: ChatwootWebhookPayload['event']): ChatwootWebhookPayload {
  return {
    event,
    id: 1,
    conversation: {
      id: 10,
      inbox_id: 2,
      status: event === 'conversation_status_changed' ? 'resolved' : 'open',
      assignee_id: null,
    },
  };
}

describe('Chatwoot webhook dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves message and conversation-created handlers', async () => {
    const message = payload('message_created');
    const conversation = payload('conversation_created');

    await dispatchChatwootWebhook(message, 'corr-message');
    await dispatchChatwootWebhook(conversation, 'corr-conversation');

    expect(runtime.processWebhookEvent).toHaveBeenCalledWith(message, 'corr-message');
    expect(runtime.processConversationCreated).toHaveBeenCalledWith(conversation);
  });

  it('preserves conversation status analytics handling', async () => {
    await dispatchChatwootWebhook(payload('conversation_status_changed'), 'corr-status');

    expect(conversationRepository.upsertConversation).toHaveBeenCalledWith({
      chatwootConversationId: 10,
      chatwootContactId: 0,
      contactName: 'Cliente',
      status: 'resolved',
    });
    expect(analytics.trackEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'conversation_ended',
      conversationId: 'conversation-10',
    }));
  });
});

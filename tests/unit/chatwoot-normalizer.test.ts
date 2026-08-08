import { normalizeMessage } from '../../src/modules/chatwoot/normalizer';
import { ChatwootWebhookPayload } from '../../src/shared/types';

function createPayload(createdAt: number | string): ChatwootWebhookPayload {
  return {
    event: 'message_created',
    id: 100,
    created_at: '2026-08-08T00:00:00.000Z',
    message: {
      id: 200,
      content: 'Mensagem',
      created_at: createdAt,
      message_type: 'incoming',
      sender: { id: 7, name: 'Maria', type: 'contact' },
      attachments: [],
      private: false,
    },
    conversation: {
      id: 42,
      uuid: 'conversation-42',
      account_id: 1,
      inbox_id: 1,
      status: 'open',
      assignee_id: null,
      contact: { id: 7, name: 'Maria' },
    },
  };
}

describe('Chatwoot message normalizer', () => {
  it('preserves the original Chatwoot timestamp when it is epoch seconds', () => {
    const normalized = normalizeMessage(createPayload(1_754_601_600));

    expect(normalized?.chatwootMessageId).toBe(200);
    expect(normalized?.timestamp).toEqual(new Date(1_754_601_600_000));
  });

  it('preserves ISO timestamps from the message instead of using processing time', () => {
    const normalized = normalizeMessage(createPayload('2026-08-07T23:59:00.000Z'));

    expect(normalized?.timestamp).toEqual(new Date('2026-08-07T23:59:00.000Z'));
  });
});

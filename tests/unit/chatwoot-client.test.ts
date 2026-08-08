import { chatwootClient } from '../../src/modules/chatwoot/client';
import { config } from '../../src/config';

describe('chatwootClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends public conversation messages through Chatwoot API', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123 }),
    });

    const result = await chatwootClient.sendMessage({
      conversationId: 42,
      content: 'Mensagem para o tutor',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.chatwoot.com/api/v1/accounts/1/conversations/42/messages',
      {
        method: 'POST',
        signal: expect.any(AbortSignal),
        headers: {
          'Content-Type': 'application/json',
          api_access_token: 'test-chatwoot-token',
        },
        body: JSON.stringify({
          content: 'Mensagem para o tutor',
          private: false,
        }),
      }
    );
    expect(result).toEqual({ id: 123 });
  });

  it('sends private internal notes when requested', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 456 }),
    });

    await chatwootClient.sendMessage({
      conversationId: 42,
      content: 'Resumo interno',
      private: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/conversations/42/messages'),
      expect.objectContaining({
        body: JSON.stringify({
          content: 'Resumo interno',
          private: true,
        }),
      })
    );
  });

  it('sends a stable response idempotency marker to Chatwoot', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 789 }),
    });

    await expect(chatwootClient.sendMessageWithIdempotency({
      conversationId: 42,
      content: 'Resposta',
      idempotencyKey: 'cvg:1:42:100',
    })).resolves.toEqual({ id: 789 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/conversations/42/messages'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          content: 'Resposta',
          private: false,
          content_attributes: { cvg_idempotency_key: 'cvg:1:42:100' },
        }),
      })
    );
  });

  it('finds an external response by marker before falling back to content', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ payload: [
        {
          id: 801,
          content: 'Resposta',
          message_type: 'outgoing',
          content_attributes: { cvg_idempotency_key: 'cvg:1:42:100' },
          created_at: '2026-08-08T00:01:00.000Z',
        },
      ] }),
    });

    await expect(chatwootClient.findMessageByIdempotencyKey(
      42,
      'cvg:1:42:100',
      'Resposta',
      new Date('2026-08-08T00:00:00.000Z')
    )).resolves.toEqual(expect.objectContaining({ id: 801 }));
  });

  it('fails closed instead of content-matching an unknown response when fallback is disabled', async () => {
    const original = config.chatwoot.allowContentReconciliationFallback;
    config.chatwoot.allowContentReconciliationFallback = false;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ payload: [
        {
          id: 803,
          content: 'Resposta',
          message_type: 'outgoing',
          created_at: '2026-08-08T00:01:00.000Z',
        },
      ] }),
    });

    try {
      await expect(chatwootClient.findMessageByIdempotencyKey(
        42,
        'cvg:1:42:100',
        'Resposta',
        new Date('2026-08-08T00:00:00.000Z')
      )).resolves.toBeNull();
    } finally {
      config.chatwoot.allowContentReconciliationFallback = original;
    }
  });

  it('requires a private outgoing message when reconciling a handoff note', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ payload: [
        {
          id: 804,
          content: 'Resumo interno',
          message_type: 'outgoing',
          private: false,
          content_attributes: { cvg_idempotency_key: 'cvg:handoff:42' },
        },
        {
          id: 805,
          content: 'Resumo interno',
          message_type: 'outgoing',
          private: true,
          content_attributes: { cvg_idempotency_key: 'cvg:handoff:42' },
        },
      ] }),
    });

    await expect(chatwootClient.findMessageByIdempotencyKey(
      42,
      'cvg:handoff:42',
      'Resumo interno',
      new Date('2026-08-08T00:00:00.000Z'),
      { private: true }
    )).resolves.toEqual(expect.objectContaining({ id: 805 }));
  });

  it('confirms an inbound message by its Chatwoot message id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ payload: [{ id: 802, message_type: 'incoming' }] }),
    });

    await expect(chatwootClient.findMessageById(42, 802))
      .resolves.toEqual({ id: 802, message_type: 'incoming' });
  });

  it('adds labels to conversations', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await chatwootClient.addLabel(42, 'handoff');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/conversations/42/labels'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ labels: ['handoff'] }),
      })
    );
  });

  it('removes selected labels by replacing the conversation label list', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ payload: ['handoff', 'pending', 'urgent'] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    await chatwootClient.removeLabels(42, ['handoff', 'pending']);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/conversations/42/labels'),
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/conversations/42/labels'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ labels: ['urgent'] }),
      })
    );
  });

  it('assigns conversations to agents', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await chatwootClient.assignConversation(42, 7);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/conversations/42'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          conversation: {
            assignee_id: 7,
          },
        }),
      })
    );
  });

  it('updates conversation status', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await chatwootClient.updateStatus(42, 'pending');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/conversations/42'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          conversation: {
            status: 'pending',
          },
        }),
      })
    );
  });

  it('returns true when health check reaches Chatwoot', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ account: { id: 1 } }),
    });

    await expect(chatwootClient.healthCheck()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.chatwoot.com/api/v1/accounts/1/agents',
      expect.objectContaining({ method: 'GET', body: undefined })
    );
  });

  it('returns false when health check fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () => 'down',
    });

    await expect(chatwootClient.healthCheck()).resolves.toBe(false);
  });

  it('propagates Chatwoot API errors for sendMessage', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'invalid token',
    });

    const request = chatwootClient.sendMessage({
      conversationId: 42,
      content: 'Mensagem',
    });
    await expect(request).rejects.toThrow('Chatwoot API error: 401 Unauthorized');
    await expect(request).rejects.not.toThrow('invalid token');
  });
});

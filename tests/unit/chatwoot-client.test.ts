import { chatwootClient } from '../../src/modules/chatwoot/client';

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
      'https://app.chatwoot.com/api/v1/accounts/test-account-id/conversations/42/messages',
      {
        method: 'POST',
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
      'https://app.chatwoot.com/api/v1/accounts/test-account-id/agents',
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

    await expect(
      chatwootClient.sendMessage({
        conversationId: 42,
        content: 'Mensagem',
      })
    ).rejects.toThrow('Chatwoot API error: 401 Unauthorized - invalid token');
  });
});

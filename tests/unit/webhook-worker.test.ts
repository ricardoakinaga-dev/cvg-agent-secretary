import {
  ChatwootWebhookWorker,
  QueuedChatwootWebhook,
  WebhookQueueStore,
  classifyWebhookError,
} from '../../src/modules/webhook/worker';
import { InboundReceiptRepository } from '../../src/modules/webhook/inboxRepository';
import { config } from '../../src/config';

const chatwootMock = vi.hoisted(() => ({
  findMessageById: vi.fn(),
}));

vi.mock('../../src/modules/chatwoot/client', () => ({
  chatwootClient: chatwootMock,
}));

function createJob(overrides: Partial<QueuedChatwootWebhook> = {}): QueuedChatwootWebhook {
  return {
    id: 'job-1',
    deliveryId: 'a'.repeat(64),
    payload: {
      event: 'message_created',
      id: 1,
      conversation: {
        id: 10,
        inbox_id: 2,
        status: 'open',
        assignee_id: null,
      },
    },
    correlationId: 'correlation-1',
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
    ...overrides,
  };
}

function createStore(job: QueuedChatwootWebhook | null = null): WebhookQueueStore {
  return {
    enqueue: vi.fn().mockResolvedValue(true),
    claim: vi.fn().mockResolvedValue(job),
    ack: vi.fn().mockResolvedValue(undefined),
    renewLease: vi.fn().mockResolvedValue(undefined),
    requeue: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
    recoverExpired: vi.fn().mockResolvedValue(0),
  };
}

function createReceipts(overrides: Record<string, unknown> = {}): InboundReceiptRepository {
  return {
    accept: vi.fn(),
    markQueued: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue({ status: 'queued' }),
    markProcessing: vi.fn().mockResolvedValue(true),
    renewProcessing: vi.fn().mockResolvedValue(true),
    markProcessed: vi.fn().mockResolvedValue(undefined),
    markDeadLetter: vi.fn().mockResolvedValue(undefined),
    markRetry: vi.fn().mockResolvedValue(undefined),
    findRecoverable: vi.fn().mockResolvedValue([]),
    findDeadLetters: vi.fn().mockResolvedValue([]),
    requeueDeadLetter: vi.fn(),
    annotateDeadLetter: vi.fn(),
    hasEarlierUnfinished: vi.fn().mockResolvedValue(false),
    ...overrides,
  } as unknown as InboundReceiptRepository;
}

describe('ChatwootWebhookWorker', () => {
  const originalConfirmInboundMessages = config.chatwoot.confirmInboundMessages;

  beforeEach(() => {
    config.chatwoot.confirmInboundMessages = originalConfirmInboundMessages;
    chatwootMock.findMessageById.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    config.chatwoot.confirmInboundMessages = originalConfirmInboundMessages;
  });

  it('atomically rejects a repeated signed delivery before it enters the queue', async () => {
    const store = createStore();
    vi.mocked(store.enqueue)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const worker = new ChatwootWebhookWorker(store, vi.fn());
    const webhookPayload = createJob().payload;
    const deliveryId = 'b'.repeat(64);

    const first = await worker.enqueue(webhookPayload, 'correlation-1', deliveryId);
    const duplicate = await worker.enqueue(webhookPayload, 'correlation-2', deliveryId);

    expect(first).toMatchObject({ deliveryId, correlationId: 'correlation-1' });
    expect(duplicate).toBeNull();
  });

  it('uses its owner token for claim and acknowledgement', async () => {
    const job = createJob();
    const store = createStore(job);
    const processEvent = vi.fn().mockResolvedValue(undefined);
    const worker = new ChatwootWebhookWorker(store, processEvent, {
      ownerId: 'worker-a',
      leaseDurationMs: 30_000,
    });

    await worker.processNext();

    expect(store.claim).toHaveBeenCalledWith('worker-a', 30_000);
    expect(processEvent).toHaveBeenCalledWith(job.payload, job.correlationId);
    expect(store.ack).toHaveBeenCalledWith(job, 'worker-a');
  });

  it('removes an expired payload without executing its handler', async () => {
    const job = createJob({ enqueuedAt: new Date(Date.now() - 3_600_000).toISOString() });
    const store = createStore(job);
    const processEvent = vi.fn();
    const worker = new ChatwootWebhookWorker(store, processEvent, {
      ownerId: 'worker-a',
      maxJobAgeMs: 60_000,
    });

    await expect(worker.processNext()).resolves.toBe(true);

    expect(processEvent).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ error: 'Webhook expired before processing' }),
      'worker-a'
    );
  });

  it('requeues a failure with a server-side due time without acknowledging it', async () => {
    const job = createJob();
    const store = createStore(job);
    const worker = new ChatwootWebhookWorker(
      store,
      vi.fn().mockRejectedValue(new Error('runtime timeout')),
      { ownerId: 'worker-a', retryDelayMs: 2_500 }
    );

    await worker.processNext();

    expect(store.ack).not.toHaveBeenCalled();
    expect(store.requeue).toHaveBeenCalledWith(job, {
      ...job,
      attempts: 1,
    }, 'worker-a', 2_500);
  });

  it('waits for an earlier durable receipt before processing a newer conversation event', async () => {
    const job = createJob({ receiptId: 'receipt-2' });
    const store = createStore(job);
    const receipts = createReceipts({ hasEarlierUnfinished: vi.fn().mockResolvedValue(true) });
    const processEvent = vi.fn();
    const worker = new ChatwootWebhookWorker(
      store,
      processEvent,
      { ownerId: 'worker-a', orderingRetryDelayMs: 125 },
      receipts
    );

    await worker.processNext();

    expect(processEvent).not.toHaveBeenCalled();
    expect(receipts.markProcessing).not.toHaveBeenCalled();
    expect(store.ack).not.toHaveBeenCalled();
    expect(store.requeue).toHaveBeenCalledWith(job, job, 'worker-a', 125);
  });

  it('renews the visibility lease while a long-running handler is active', async () => {
    vi.useFakeTimers();
    const job = createJob();
    const store = createStore(job);
    let finishProcessing!: () => void;
    const processing = new Promise<void>((resolve) => {
      finishProcessing = resolve;
    });
    const worker = new ChatwootWebhookWorker(store, () => processing, {
      ownerId: 'worker-a',
      leaseDurationMs: 90,
      heartbeatIntervalMs: 30,
    });

    const result = worker.processNext();
    await vi.advanceTimersByTimeAsync(65);

    expect(store.renewLease).toHaveBeenCalledTimes(2);
    expect(store.renewLease).toHaveBeenCalledWith(job, 'worker-a', 90);

    finishProcessing();
    await result;
    await vi.advanceTimersByTimeAsync(100);
    expect(store.renewLease).toHaveBeenCalledTimes(2);
  });

  it('moves a poison job to the dead-letter queue at the attempt limit', async () => {
    const job = createJob({ attempts: 4 });
    const store = createStore(job);
    const worker = new ChatwootWebhookWorker(
      store,
      vi.fn().mockRejectedValue(new Error('permanent runtime failure')),
      { ownerId: 'worker-a', retryDelayMs: 0 }
    );

    await worker.processNext();

    expect(store.ack).not.toHaveBeenCalled();
    expect(store.requeue).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(job, {
      id: job.id,
      correlationId: job.correlationId,
      enqueuedAt: job.enqueuedAt,
      attempts: 5,
          event: 'message_created',
          failedAt: expect.any(String),
          error: 'permanent runtime failure',
          failureClass: 'transient',
        }, 'worker-a');
    expect(vi.mocked(store.fail).mock.calls[0][1]).not.toHaveProperty('payload');
  });

  it('classifies permanent provider failures and moves them to the DLQ immediately', async () => {
    const job = createJob({ receiptId: 'receipt-1' });
    const store = createStore(job);
    const receipts = createReceipts();
    const providerError = Object.assign(new Error('Chatwoot API error: 422 Unprocessable Entity'), {
      status: 422,
    });
    const worker = new ChatwootWebhookWorker(
      store,
      vi.fn().mockRejectedValue(providerError),
      { ownerId: 'worker-a', maxAttempts: 5 },
      receipts
    );

    await worker.processNext();

    expect(store.requeue).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ failureClass: 'permanent', attempts: 1 }),
      'worker-a'
    );
    expect(receipts.markDeadLetter).toHaveBeenCalledWith(
      'receipt-1',
      providerError.message,
      'worker-a'
    );
  });

  it('keeps unknown failures retryable while exposing their classification', () => {
    expect(classifyWebhookError(new Error('network timeout'))).toBe('transient');
    expect(classifyWebhookError(Object.assign(new Error('bad request'), { status: 422 }))).toBe('permanent');
    expect(classifyWebhookError(new Error('Conversation lock was lost'))).toBe('contention');
  });

  it('recovers only expired events before starting the processing loop', async () => {
    const store = createStore(null);
    const worker = new ChatwootWebhookWorker(store, vi.fn(), {
      ownerId: 'worker-a',
      pollIntervalMs: 1,
    });

    await worker.start();
    await worker.stop();

    expect(store.recoverExpired).toHaveBeenCalledOnce();
    expect(store.claim).toHaveBeenCalled();
  });

  it('generates distinct opaque worker owners by default', async () => {
    const firstStore = createStore(null);
    const secondStore = createStore(null);
    const first = new ChatwootWebhookWorker(firstStore, vi.fn());
    const second = new ChatwootWebhookWorker(secondStore, vi.fn());

    await first.processNext();
    await second.processNext();

    const firstOwner = vi.mocked(firstStore.claim).mock.calls[0][0];
    const secondOwner = vi.mocked(secondStore.claim).mock.calls[0][0];
    expect(firstOwner).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondOwner).not.toBe(firstOwner);
  });

  it('uses the durable receipt lease to prevent a duplicate worker from re-running a turn', async () => {
    const job = createJob({ receiptId: 'receipt-1' });
    const store = createStore(job);
    const receipts = createReceipts({ markProcessing: vi.fn().mockResolvedValue(false) });
    const processEvent = vi.fn();
    const worker = new ChatwootWebhookWorker(
      store,
      processEvent,
      { ownerId: 'worker-a', leaseDurationMs: 30_000 },
      receipts
    );

    await worker.processNext();

    expect(receipts.markProcessing).toHaveBeenCalledWith('receipt-1', 'worker-a', 30_000);
    expect(processEvent).not.toHaveBeenCalled();
    expect(store.ack).toHaveBeenCalledWith(job, 'worker-a');
  });

  it('records retry ownership in the durable receipt before requeueing a failed turn', async () => {
    const job = createJob({ receiptId: 'receipt-1' });
    const store = createStore(job);
    const receipts = createReceipts();
    const worker = new ChatwootWebhookWorker(
      store,
      vi.fn().mockRejectedValue(new Error('runtime timeout')),
      { ownerId: 'worker-a', retryDelayMs: 2_500 },
      receipts
    );

    await worker.processNext();

    expect(receipts.markRetry).toHaveBeenCalledWith(
      'receipt-1',
      'runtime timeout',
      2_500,
      'worker-a'
    );
    expect(store.requeue).toHaveBeenCalled();
  });

  it('confirms the exact persisted incoming message before dispatching the turn', async () => {
    config.chatwoot.confirmInboundMessages = true;
    const job = createJob({
      payload: {
        ...createJob().payload,
        message: {
          id: 77,
          content: 'Mensagem confirmada',
          message_type: 'incoming',
          sender: { id: 99, name: 'Maria', type: 'contact' },
          private: false,
        },
      },
    });
    chatwootMock.findMessageById.mockResolvedValue({
      id: 77,
      message_type: 'incoming',
      private: false,
    });
    const store = createStore(job);
    const processEvent = vi.fn().mockResolvedValue(undefined);
    const worker = new ChatwootWebhookWorker(store, processEvent, { ownerId: 'worker-a' });

    await worker.processNext();

    expect(chatwootMock.findMessageById).toHaveBeenCalledWith(10, 77);
    expect(processEvent).toHaveBeenCalledOnce();
  });

  it('keeps processing blocked when the confirmed Chatwoot record is outgoing or private', async () => {
    config.chatwoot.confirmInboundMessages = true;
    const job = createJob({
      payload: {
        ...createJob().payload,
        message: {
          id: 78,
          content: 'Mensagem suspeita',
          message_type: 'incoming',
          sender: { id: 99, name: 'Maria', type: 'contact' },
          private: false,
        },
      },
    });
    chatwootMock.findMessageById.mockResolvedValue({
      id: 78,
      message_type: 'outgoing',
      private: false,
    });
    const store = createStore(job);
    const processEvent = vi.fn();
    const worker = new ChatwootWebhookWorker(store, processEvent, {
      ownerId: 'worker-a',
      retryDelayMs: 0,
    });

    await worker.processNext();

    expect(processEvent).not.toHaveBeenCalled();
    expect(store.requeue).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ attempts: 1 }),
      'worker-a',
      0
    );
  });
});

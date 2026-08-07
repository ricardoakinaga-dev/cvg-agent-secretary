import {
  ChatwootWebhookWorker,
  QueuedChatwootWebhook,
  WebhookQueueStore,
} from '../../src/modules/webhook/worker';

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

describe('ChatwootWebhookWorker', () => {
  afterEach(() => {
    vi.useRealTimers();
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
    }, 'worker-a');
    expect(vi.mocked(store.fail).mock.calls[0][1]).not.toHaveProperty('payload');
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
});

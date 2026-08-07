import {
  startServer,
  stopServer,
  StartServerDependencies,
  StopServerDependencies,
} from '../../src/server';
import { config, validateConfig } from '../../src/config';
import type { Server } from 'http';

function createHttpServer(): Server {
  return { close: vi.fn() } as unknown as Server;
}

function createDependencies(
  validation: ReturnType<StartServerDependencies['validateConfig']>,
  httpServer: Server = createHttpServer()
): StartServerDependencies {
  return {
    validateConfig: vi.fn(() => validation),
    assertPiiReady: vi.fn().mockResolvedValue(undefined),
    connectRedis: vi.fn().mockResolvedValue(undefined),
    startWebhookWorker: vi.fn().mockResolvedValue(undefined),
    startHandoffCleanup: vi.fn(),
    listen: vi.fn(() => httpServer),
  };
}

describe('server startup', () => {
  it.each([
    ['CHATWOOT_WEBHOOK_SECRET is required'],
    ['API_JWT_PUBLIC_KEY is required in production'],
  ])('fails before connecting or listening when config is invalid: %s', async (error) => {
    const dependencies = createDependencies({ valid: false, errors: [error] });

    await expect(startServer(dependencies)).rejects.toThrow(error);

    expect(dependencies.validateConfig).toHaveBeenCalledOnce();
    expect(dependencies.connectRedis).not.toHaveBeenCalled();
    expect(dependencies.assertPiiReady).not.toHaveBeenCalled();
    expect(dependencies.startWebhookWorker).not.toHaveBeenCalled();
    expect(dependencies.startHandoffCleanup).not.toHaveBeenCalled();
    expect(dependencies.listen).not.toHaveBeenCalled();
  });

  it('uses the real production validation before opening the port', async () => {
    const originalProduction = config.isProduction;
    const originalWebhookSecret = config.chatwoot.webhookSecret;
    const originalJwtPublicKey = config.auth.jwtPublicKey;
    const originalJwtIssuer = config.auth.jwtIssuer;
    const originalJwtAudience = config.auth.jwtAudience;
    const originalLegacyFlag = config.auth.allowLegacyApiToken;
    const originalPii = { ...config.pii };

    try {
      config.isProduction = true;
      config.chatwoot.webhookSecret = '';
      config.auth.jwtPublicKey = '';
      config.auth.jwtIssuer = '';
      config.auth.jwtAudience = '';
      config.auth.allowLegacyApiToken = true;
      const key = Buffer.alloc(32, 7).toString('base64');
      config.pii.encryptionRequired = true;
      config.pii.activeKeyId = 'startup-test';
      config.pii.encryptionKeysJson = JSON.stringify({ 'startup-test': key });
      config.pii.lookupKey = key;

      const dependencies = createDependencies(validateConfig());

      await expect(startServer(dependencies)).rejects.toThrow(
        'CHATWOOT_WEBHOOK_SECRET is required; API_JWT_PUBLIC_KEY is required in production; API_JWT_ISSUER is required in production; API_JWT_AUDIENCE is required in production; ALLOW_LEGACY_API_TOKEN must be false in production'
      );
      expect(dependencies.connectRedis).not.toHaveBeenCalled();
      expect(dependencies.listen).not.toHaveBeenCalled();
    } finally {
      config.isProduction = originalProduction;
      config.chatwoot.webhookSecret = originalWebhookSecret;
      config.auth.jwtPublicKey = originalJwtPublicKey;
      config.auth.jwtIssuer = originalJwtIssuer;
      config.auth.jwtAudience = originalJwtAudience;
      config.auth.allowLegacyApiToken = originalLegacyFlag;
      Object.assign(config.pii, originalPii);
    }
  });

  it('starts the durable worker after Redis and before listening', async () => {
    const dependencies = createDependencies({ valid: true, errors: [] });

    await startServer(dependencies);

    expect(dependencies.assertPiiReady).toHaveBeenCalledOnce();
    expect(dependencies.connectRedis).toHaveBeenCalledOnce();
    expect(dependencies.startWebhookWorker).toHaveBeenCalledOnce();
    expect(dependencies.listen).toHaveBeenCalledOnce();
    expect(vi.mocked(dependencies.assertPiiReady).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(dependencies.connectRedis).mock.invocationCallOrder[0]);
    expect(vi.mocked(dependencies.connectRedis).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(dependencies.startWebhookWorker).mock.invocationCallOrder[0]);
    expect(vi.mocked(dependencies.startWebhookWorker).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(dependencies.listen).mock.invocationCallOrder[0]);
  });

  it('fails before opening dependencies when the PII backfill is incomplete', async () => {
    const dependencies = createDependencies({ valid: true, errors: [] });
    vi.mocked(dependencies.assertPiiReady).mockRejectedValueOnce(new Error('PII backfill required'));

    await expect(startServer(dependencies)).rejects.toThrow('PII backfill required');

    expect(dependencies.connectRedis).not.toHaveBeenCalled();
    expect(dependencies.startWebhookWorker).not.toHaveBeenCalled();
    expect(dependencies.listen).not.toHaveBeenCalled();
  });

  it('retains the HTTP handle and closes resources in safe order', async () => {
    const httpServer = createHttpServer();
    const startDependencies = createDependencies({ valid: true, errors: [] }, httpServer);
    const dependencies: StopServerDependencies = {
      closeHttpServer: vi.fn().mockResolvedValue(undefined),
      stopWebhookWorker: vi.fn().mockResolvedValue(undefined),
      disconnectRedis: vi.fn().mockResolvedValue(undefined),
      closeDbPool: vi.fn().mockResolvedValue(undefined),
    };

    await startServer(startDependencies);
    await stopServer(dependencies);

    expect(dependencies.closeHttpServer).toHaveBeenCalledWith(httpServer);
    expect(dependencies.stopWebhookWorker).toHaveBeenCalledOnce();
    expect(dependencies.disconnectRedis).toHaveBeenCalledOnce();
    expect(dependencies.closeDbPool).toHaveBeenCalledOnce();
    expect(vi.mocked(dependencies.closeHttpServer).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(dependencies.stopWebhookWorker).mock.invocationCallOrder[0]);
    expect(vi.mocked(dependencies.stopWebhookWorker).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(dependencies.disconnectRedis).mock.invocationCallOrder[0]);
    expect(vi.mocked(dependencies.disconnectRedis).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(dependencies.closeDbPool).mock.invocationCallOrder[0]);
  });

  it('continues closing later resources when an earlier close fails', async () => {
    const dependencies: StopServerDependencies = {
      closeHttpServer: vi.fn().mockRejectedValue(new Error('close failed')),
      stopWebhookWorker: vi.fn().mockResolvedValue(undefined),
      disconnectRedis: vi.fn().mockResolvedValue(undefined),
      closeDbPool: vi.fn().mockResolvedValue(undefined),
    };

    await expect(stopServer(dependencies)).rejects.toThrow('close failed');

    expect(dependencies.stopWebhookWorker).toHaveBeenCalledOnce();
    expect(dependencies.disconnectRedis).toHaveBeenCalledOnce();
    expect(dependencies.closeDbPool).toHaveBeenCalledOnce();
  });
});

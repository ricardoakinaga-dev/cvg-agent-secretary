import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const runReliabilityIntegration = process.env.RUN_RELIABILITY_INTEGRATION === 'true';

export function requiredReliabilityEnv(name: string): string {
  const value = process.env[name];
  if (!runReliabilityIntegration) {
    return value ?? 'reliability-test-disabled';
  }
  if (!value) {
    throw new Error(`${name} is required for reliability integration tests`);
  }
  return value;
}

export function boundedPositiveIntegerEnv(
  name: string,
  defaultValue: number,
  maximum: number
): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return defaultValue;
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

export async function runDocker(
  arguments_: string[],
  timeoutMs = 120_000
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('docker', arguments_, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: timeoutMs,
  });
}

export async function assertDisposableContainer(containerId: string): Promise<void> {
  if (!/^[a-f0-9]{12,64}$/i.test(containerId)) {
    throw new Error('Reliability container id is invalid');
  }
  const result = await runDocker([
    'inspect',
    '--format',
    '{{ index .Config.Labels "com.cvg.environment" }}',
    containerId,
  ], 30_000);
  if (result.stdout.trim() !== 'disposable-integration') {
    throw new Error('Reliability tests refuse to mutate a non-disposable container');
  }
}

export async function writeReliabilityEvidence(
  filename: string,
  evidence: Record<string, unknown>
): Promise<void> {
  const outputDirectory = 'coverage/reliability';
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    `${outputDirectory}/${filename}`,
    `${JSON.stringify({
      schemaVersion: 1,
      commit: process.env.GITHUB_SHA ?? null,
      measuredAt: new Date().toISOString(),
      ...evidence,
    }, null, 2)}\n`,
    'utf8'
  );
}

export function emitReliabilityMeasurement(
  scenario: string,
  measurements: Record<string, unknown>
): void {
  process.stdout.write(`[reliability] ${JSON.stringify({ scenario, ...measurements })}\n`);
}

export async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 250
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const suffix = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`Condition was not satisfied within ${timeoutMs}ms${suffix}`);
}

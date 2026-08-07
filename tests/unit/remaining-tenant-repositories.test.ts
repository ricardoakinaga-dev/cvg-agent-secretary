import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('remaining tenant repository boundaries', () => {
  it.each([
    'src/modules/audit/service.ts',
    'src/modules/analytics/repository.ts',
    'src/modules/handoff/repository.ts',
    'src/modules/handoff/followupRepository.ts',
    'src/modules/knowledge/repository.ts',
    'src/modules/summaries/repository.ts',
    'src/modules/telegram-ingestion/repository.ts',
  ])('%s scopes persistence with the configured Chatwoot account', (repositoryPath) => {
    const source = readFileSync(resolve(repositoryPath), 'utf8');

    expect(source).toContain("config.chatwoot.accountId");
    expect(source).toContain('tenant_id');
  });
});

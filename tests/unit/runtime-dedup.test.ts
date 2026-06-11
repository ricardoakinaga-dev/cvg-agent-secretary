import { describe, expect, it } from 'vitest';
import { generateContentDedupHash, normalizeDedupContent } from '../../src/modules/runtime/dedup';

describe('runtime deduplication', () => {
  it('generates the same content hash for duplicate deliveries with different message ids', () => {
    const first = generateContentDedupHash('chatwoot-1', '1', 'Preciso passar meu cachorro em consulta');
    const duplicate = generateContentDedupHash('chatwoot-1', '1', '  preciso passar meu cachorro em consulta  ');

    expect(duplicate).toBe(first);
  });

  it('generates different content hashes for different messages', () => {
    const first = generateContentDedupHash('chatwoot-1', '1', 'Preciso passar meu cachorro em consulta');
    const second = generateContentDedupHash('chatwoot-1', '1', 'Quais os horários de atendimento?');

    expect(second).not.toBe(first);
  });

  it('normalizes content before hashing', () => {
    expect(normalizeDedupContent('  Olá,\n\npreciso   de consulta.  ')).toBe('olá, preciso de consulta.');
  });
});

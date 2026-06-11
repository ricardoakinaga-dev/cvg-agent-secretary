import { describe, expect, it } from 'vitest';
import { looksLikeHumanOperatorMessage } from '../../src/modules/runtime/agentRuntime';

describe('human takeover detection', () => {
  it('detects operator replies sent through the contact channel', () => {
    expect(
      looksLikeHumanOperatorMessage('Ola tudo bem sou do centro veterinário Guarapiranga no que posso ajudar?')
    ).toBe(true);
  });

  it('does not classify ordinary customer greetings as operator replies', () => {
    expect(looksLikeHumanOperatorMessage('Olá, tudo bem? Preciso de ajuda com meu cachorro.')).toBe(false);
  });
});

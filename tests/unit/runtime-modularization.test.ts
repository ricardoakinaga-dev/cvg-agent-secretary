import { describe, expect, it } from 'vitest';
import { AgentResponse, KnowledgeChunk } from '../../src/shared/types';
import { IntentClassification } from '../../src/modules/intent/types';
import {
  enforceSchedulingEvidence,
  enforceUnansweredHandoff,
  responseForRequiredHandoff,
  selectDeterministicResponse,
} from '../../src/modules/runtime/responsePolicy';

function classification(
  overrides: Partial<IntentClassification> = {}
): IntentClassification {
  return {
    intent: 'duvida_operacional',
    confidence: 0.8,
    priority: 'medium',
    detectedKeywords: [],
    entities: {},
    requiresHandoff: false,
    riskLevel: 'low',
    ...overrides,
  };
}

const schedulingKnowledge: KnowledgeChunk[] = [{
  id: 'knowledge-1',
  content: 'Consulta cardiológica somente com agendamento prévio.',
  source: 'institutional',
  relevance: 0.95,
}];

describe('modular runtime response policy', () => {
  it('keeps emergency escalation deterministic and immediate', () => {
    const result = responseForRequiredHandoff(classification({
      intent: 'possivel_urgencia',
      priority: 'critical',
      requiresHandoff: true,
      handoffReason: 'Sinais de emergência',
      riskLevel: 'high',
    }));

    expect(result.confidence).toBe(1);
    expect(result.action).toMatchObject({
      type: 'handoff',
      reason: 'Sinais de emergência',
    });
    expect(result.content).toContain('imediatamente');
    expect(result.content).toContain('Centro Veterinário Guarapiranga');
  });

  it('selects a greeting without invoking provider-specific behavior', () => {
    const result = selectDeterministicResponse({
      message: 'Olá',
      classification: classification({ intent: 'saudacao' }),
      shouldUseKnowledge: false,
      knowledge: [],
    });

    expect(result).toMatchObject({
      confidence: 1,
      action: { type: 'respond', content: 'greeting' },
    });
  });

  it('fails closed when an evidence-dependent answer has no knowledge', () => {
    const result = selectDeterministicResponse({
      message: 'Quanto custa uma consulta?',
      classification: classification({ intent: 'precos' }),
      shouldUseKnowledge: true,
      knowledge: [],
    });

    expect(result).toMatchObject({
      confidence: 0,
      action: { type: 'fallback', reason: 'knowledge_not_found' },
    });
  });

  it('blocks an unsupported scheduling claim', () => {
    const unsafeResponse: AgentResponse = {
      content: 'Posso agendar esse serviço para amanhã.',
      confidence: 0.9,
      action: { type: 'respond', content: 'proposal' },
    };

    const result = enforceSchedulingEvidence({
      message: 'Quero agendar esse procedimento',
      classification: classification({ intent: 'agendamento' }),
      knowledge: [],
      response: unsafeResponse,
    });

    expect(result).toMatchObject({
      confidence: 0,
      action: {
        type: 'handoff',
        reason: 'Agendamento sem evidência institucional ou agenda confiável',
      },
    });
  });

  it('preserves a scheduling response backed by institutional evidence', () => {
    const supportedResponse: AgentResponse = {
      content: 'Posso agendar a consulta cardiológica.',
      confidence: 0.9,
      action: { type: 'respond', content: 'proposal' },
    };

    expect(enforceSchedulingEvidence({
      message: 'Quero agendar cardiologia',
      classification: classification({ intent: 'agendamento' }),
      knowledge: schedulingKnowledge,
      response: supportedResponse,
    })).toBe(supportedResponse);
  });

  it('converts low-confidence and fallback answers into a human handoff', () => {
    const result = enforceUnansweredHandoff({
      content: 'Não sei.',
      confidence: 0.2,
      action: { type: 'fallback', reason: 'insufficient_evidence' },
    });

    expect(result.action).toMatchObject({
      type: 'handoff',
      reason: 'insufficient_evidence',
    });
  });
});

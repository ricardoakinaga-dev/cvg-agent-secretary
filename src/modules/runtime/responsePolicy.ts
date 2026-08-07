import { AgentResponse, KnowledgeChunk } from '../../shared/types';
import {
  buildClinicalWalkInResponse,
  buildServiceAvailabilityResponse,
  containsSchedulingProposal,
  hasHoursEvidence,
  hasPriceEvidence,
  hasSchedulingPolicyEvidence,
  isHoursQuery,
  isPricingQuery,
  isSchedulingRequest,
  isServiceAvailabilityQuery,
  shouldUseClinicalWalkInResponse,
} from '../knowledge/context';
import { IntentClassification } from '../intent/types';
import { generateFallbackResponse } from '../security/guardrails';

export const NO_ANSWER_HANDOFF_MESSAGE =
  'Desculpe, não tenho essa resposta então vou te transferir para um atendente humano.';

const EMERGENCY_HANDOFF_MESSAGE = [
  'Isso pode ser uma emergência. Venha ao Centro Veterinário Guarapiranga imediatamente para avaliação presencial.',
  'Vou transferir a conversa para um atendente humano agora para acompanhar seu caso.',
].join(' ');

export function createGreetingResponse(): AgentResponse {
  return {
    content: 'Olá! Sou a assistente virtual do Centro Veterinário Guarapiranga. Como posso ajudar?',
    confidence: 1,
    action: { type: 'respond', content: 'greeting' },
  };
}

export function responseForRequiredHandoff(
  classification: IntentClassification
): AgentResponse {
  if (classification.intent === 'possivel_urgencia') {
    return {
      content: EMERGENCY_HANDOFF_MESSAGE,
      confidence: 1,
      action: {
        type: 'handoff',
        reason: classification.handoffReason || 'Emergência clínica identificada',
        summary: 'Cliente relatou possível emergência clínica. Orientado a vir imediatamente ao Centro Veterinário Guarapiranga.',
      },
    };
  }

  return {
    content: classification.intent === 'pedido_humano'
      ? 'Vou transferir você para um atendente humano para continuar o atendimento.'
      : NO_ANSWER_HANDOFF_MESSAGE,
    confidence: classification.confidence,
    action: {
      type: 'handoff',
      reason: classification.handoffReason || 'Atendimento requer humano',
      summary: 'Conversa transferida para atendimento humano.',
    },
  };
}

export function selectDeterministicResponse(params: {
  message: string;
  classification: IntentClassification;
  shouldUseKnowledge: boolean;
  knowledge: KnowledgeChunk[];
}): AgentResponse | undefined {
  const { message, classification, shouldUseKnowledge, knowledge } = params;

  if (classification.intent === 'saudacao') {
    return createGreetingResponse();
  }
  if (shouldUseClinicalWalkInResponse(message, knowledge, classification.intent)) {
    return {
      content: buildClinicalWalkInResponse(message, knowledge),
      confidence: 0.95,
      action: { type: 'respond', content: 'institutional_walk_in_policy' },
    };
  }
  if (shouldUseKnowledge && knowledge.length === 0) {
    return {
      content: generateFallbackResponse('no_knowledge'),
      confidence: 0,
      action: { type: 'fallback', reason: 'knowledge_not_found' },
    };
  }
  if (isPricingQuery(message) && !hasPriceEvidence(knowledge)) {
    return {
      content: generateFallbackResponse('no_knowledge'),
      confidence: 0,
      action: { type: 'fallback', reason: 'pricing_without_knowledge' },
    };
  }
  if (isHoursQuery(message) && !hasHoursEvidence(knowledge)) {
    return {
      content: generateFallbackResponse('no_knowledge'),
      confidence: 0,
      action: { type: 'fallback', reason: 'hours_without_knowledge' },
    };
  }

  return undefined;
}

export function enforceSchedulingEvidence(params: {
  message: string;
  classification: IntentClassification;
  knowledge: KnowledgeChunk[];
  response: AgentResponse;
}): AgentResponse {
  const { message, classification, knowledge, response } = params;
  if (!containsSchedulingProposal(response.content) || hasSchedulingPolicyEvidence(knowledge)) {
    return response;
  }

  if (shouldUseClinicalWalkInResponse(message, knowledge, classification.intent)) {
    return {
      content: buildClinicalWalkInResponse(message, knowledge),
      confidence: 0.95,
      action: { type: 'respond', content: 'institutional_walk_in_policy' },
    };
  }
  if (isServiceAvailabilityQuery(message) && !isSchedulingRequest(message)) {
    return {
      content: buildServiceAvailabilityResponse(message, knowledge),
      confidence: 0.9,
      action: { type: 'respond', content: 'institutional_service_info' },
    };
  }
  if (classification.intent === 'agendamento') {
    return {
      content: 'Para evitar informação incorreta, preciso confirmar a forma de atendimento e disponibilidade desse serviço com um atendente humano.',
      confidence: 0,
      action: {
        type: 'handoff',
        reason: 'Agendamento sem evidência institucional ou agenda confiável',
        summary: 'Tutor pediu agendamento, mas a base recuperada não confirmou que o serviço é agendável.',
      },
    };
  }

  return response;
}

export function enforceUnansweredHandoff(response: AgentResponse): AgentResponse {
  if (
    response.action?.type !== 'handoff'
    && (response.confidence < 0.6 || response.action?.type === 'fallback')
    && response.action?.type !== 'respond'
  ) {
    return {
      content: NO_ANSWER_HANDOFF_MESSAGE,
      confidence: response.confidence,
      action: {
        type: 'handoff',
        reason: response.action?.reason || 'Resposta com baixa confiança',
        summary: 'O bot não encontrou uma resposta adequada e transferiu para atendimento humano.',
      },
    };
  }

  if (response.confidence < 0.6 && response.action?.type !== 'handoff') {
    return {
      content: NO_ANSWER_HANDOFF_MESSAGE,
      confidence: response.confidence,
      action: {
        type: 'handoff',
        reason: 'Resposta com baixa confiança',
        summary: 'O bot não teve confiança suficiente para resolver a solicitação.',
      },
    };
  }

  return response;
}

// Enhanced Chatwoot Integration for Phase 4
// Based on specs/06_CHATWOOT_INTEGRATION.md

import { chatwootClient } from './client';
import { logger } from '../logging';

/**
 * Handoff-related labels for Chatwoot
 */
export const HANDOFF_LABELS = {
  HANDOFF: 'handoff',
  URGENT: 'urgent',
  COMPLAINT: 'complaint',
  FINANCIAL: 'financial',
  RESOLVED: 'resolved',
  PENDING: 'pending',
  ESCALATED: 'escalated',
} as const;

/**
 * Summary for human agent
 */
export interface HandoffSummary {
  contactName: string;
  petName?: string;
  conversationHistory: string[];
  whatClientWanted: string;
  informationCollected: Record<string, string>;
  handoffReason: string;
  pendingQuestions: string[];
  whatWasAnswered: string[];
}

/**
 * Generate structured summary for human agent
 * Based on specs/08_HANDOFF_SYSTEM.md
 */
export function generateHandoffSummary(summary: HandoffSummary): string {
  const lines: string[] = [
    '📋 **RESUMO DA CONVERSA**',
    '',
    `👤 **Cliente:** ${summary.contactName}`,
  ];

  if (summary.petName) {
    lines.push(`🐾 **Pet:** ${summary.petName}`);
  }

  lines.push('');
  lines.push('📝 **O QUE O CLIENTE QUERIA:**');
  lines.push(summary.whatClientWanted);
  lines.push('');

  lines.push('💬 **HISTÓRICO DA CONVERSA:**');
  summary.conversationHistory.forEach((msg, i) => {
    lines.push(`${i + 1}. ${msg}`);
  });
  lines.push('');

  if (Object.keys(summary.informationCollected).length > 0) {
    lines.push('🔍 **INFORMAÇÕES COLETADAS:**');
    for (const [key, value] of Object.entries(summary.informationCollected)) {
      lines.push(`- ${key}: ${value}`);
    }
    lines.push('');
  }

  lines.push('⚠️ **MOTIVO DA TRANSFERÊNCIA:**');
  lines.push(summary.handoffReason);
  lines.push('');

  if (summary.pendingQuestions.length > 0) {
    lines.push('❓ **PERGUNTAS PENDENTES:**');
    summary.pendingQuestions.forEach(q => {
      lines.push(`- ${q}`);
    });
    lines.push('');
  }

  if (summary.whatWasAnswered.length > 0) {
    lines.push('✅ **JÁ TENTAMOS/RESPONDEMOS:**');
    summary.whatWasAnswered.forEach(a => {
      lines.push(`- ${a}`);
    });
  }

  return lines.join('\n');
}

/**
 * Execute handoff in Chatwoot
 */
export async function executeHandoff(
  conversationId: number,
  summary: HandoffSummary,
  labels: string[] = []
): Promise<void> {
  try {
    // 1. Add labels
    const allLabels = [HANDOFF_LABELS.HANDOFF, ...labels];
    for (const label of allLabels) {
      try {
        await chatwootClient.addLabel(conversationId, label);
      } catch (labelError) {
        logger.warn('Failed to add label', { conversationId: String(conversationId), label, error: labelError });
      }
    }

    // 2. Create internal note with summary
    const summaryText = generateHandoffSummary(summary);
    await chatwootClient.sendMessage({
      conversationId,
      content: summaryText,
      private: true, // Internal note
    });

    logger.info('Handoff executed in Chatwoot', {
      conversationId: String(conversationId),
      labels: allLabels,
    });
  } catch (error) {
    logger.error('Failed to execute handoff in Chatwoot', error as Error, {
      conversationId: String(conversationId),
    });
    throw error;
  }
}

/**
 * Create transfer message for client
 */
export function createTransferMessage(): string {
  return `Foi um prazer ajudar! 👋

Por agora, vou transferir você para um de nossos atendentes que poderá continuar te auxiliando com mais detalhes.

Aguarde um momento, por favor!`;
}

/**
 * Create waiting message during handoff
 */
export function createWaitingMessage(): string {
  return `Aguarde um momento, por favor! 

Um de nossos atendentes vai assumir seu atendimento em instantes. ⏳`;
}

/**
 * Map intent to Chatwoot labels
 */
export function getLabelsForIntent(intent: string, riskLevel?: string): string[] {
  const labels: string[] = [];

  switch (intent) {
    case 'possivel_urgencia':
      labels.push(HANDOFF_LABELS.URGENT);
      break;
    case 'reclamacao':
      labels.push(HANDOFF_LABELS.COMPLAINT);
      break;
    case 'financeiro_sensivel':
      labels.push(HANDOFF_LABELS.FINANCIAL);
      break;
    case 'pedido_humano':
      labels.push(HANDOFF_LABELS.ESCALATED);
      break;
  }

  // Add risk level label if high
  if (riskLevel === 'high') {
    labels.push(HANDOFF_LABELS.URGENT);
  }

  return labels;
}

// Enhanced Chatwoot Integration for Phase 4
// Based on specs/06_CHATWOOT_INTEGRATION.md

import { chatwootClient } from './client';
import { logger } from '../logging';

const MAX_HANDOFF_NOTE_CHARS = 6000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_LIST_ITEMS = 4;
const OMITTED_MARKER = '… [conteudo omitido]';

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars - OMITTED_MARKER.length).trimEnd()}${OMITTED_MARKER}`;
}

function appendBoundedList(
  lines: string[],
  values: string[],
  maxItems: number,
  maxItemChars: number
): void {
  values.slice(0, maxItems).forEach((value) => {
    lines.push(`- ${truncateText(value, maxItemChars)}`);
  });

  if (values.length > maxItems) {
    lines.push(`- ${OMITTED_MARKER} (${values.length - maxItems} itens)`);
  }
}

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
    `👤 **Cliente:** ${truncateText(summary.contactName, 120)}`,
  ];

  if (summary.petName) {
    lines.push(`🐾 **Pet:** ${truncateText(summary.petName, 120)}`);
  }

  lines.push('');
  lines.push('📝 **O QUE O CLIENTE QUERIA:**');
  lines.push(truncateText(summary.whatClientWanted, 400));
  lines.push('');

  if (Object.keys(summary.informationCollected).length > 0) {
    lines.push('🔍 **INFORMAÇÕES COLETADAS:**');
    const entries = Object.entries(summary.informationCollected);
    for (const [key, value] of entries.slice(0, MAX_LIST_ITEMS)) {
      lines.push(`- ${truncateText(key, 60)}: ${truncateText(value, 120)}`);
    }
    if (entries.length > MAX_LIST_ITEMS) {
      lines.push(`- ${OMITTED_MARKER} (${entries.length - MAX_LIST_ITEMS} itens)`);
    }
    lines.push('');
  }

  lines.push('⚠️ **MOTIVO DA TRANSFERÊNCIA:**');
  lines.push(truncateText(summary.handoffReason, 400));
  lines.push('');

  if (summary.pendingQuestions.length > 0) {
    lines.push('❓ **PERGUNTAS PENDENTES:**');
    appendBoundedList(lines, summary.pendingQuestions, MAX_LIST_ITEMS, 160);
    lines.push('');
  }

  if (summary.whatWasAnswered.length > 0) {
    lines.push('✅ **JÁ TENTAMOS/RESPONDEMOS:**');
    appendBoundedList(lines, summary.whatWasAnswered, MAX_LIST_ITEMS, 160);
    lines.push('');
  }

  lines.push('💬 **HISTÓRICO DA CONVERSA (RECENTE):**');
  const historyStart = Math.max(0, summary.conversationHistory.length - MAX_HISTORY_MESSAGES);
  if (historyStart > 0) {
    lines.push(`${OMITTED_MARKER} (${historyStart} mensagens anteriores)`);
  }
  summary.conversationHistory.slice(historyStart).forEach((message, index) => {
    lines.push(`${historyStart + index + 1}. ${truncateText(message, 220)}`);
  });

  return truncateText(lines.join('\n'), MAX_HANDOFF_NOTE_CHARS);
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

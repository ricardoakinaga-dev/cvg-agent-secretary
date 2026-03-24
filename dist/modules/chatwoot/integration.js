"use strict";
// Enhanced Chatwoot Integration for Phase 4
// Based on specs/06_CHATWOOT_INTEGRATION.md
Object.defineProperty(exports, "__esModule", { value: true });
exports.HANDOFF_LABELS = void 0;
exports.generateHandoffSummary = generateHandoffSummary;
exports.executeHandoff = executeHandoff;
exports.createTransferMessage = createTransferMessage;
exports.createWaitingMessage = createWaitingMessage;
exports.getLabelsForIntent = getLabelsForIntent;
const client_1 = require("./client");
const logging_1 = require("../logging");
/**
 * Handoff-related labels for Chatwoot
 */
exports.HANDOFF_LABELS = {
    HANDOFF: 'handoff',
    URGENT: 'urgent',
    COMPLAINT: 'complaint',
    FINANCIAL: 'financial',
    RESOLVED: 'resolved',
    PENDING: 'pending',
    ESCALATED: 'escalated',
};
/**
 * Generate structured summary for human agent
 * Based on specs/08_HANDOFF_SYSTEM.md
 */
function generateHandoffSummary(summary) {
    const lines = [
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
async function executeHandoff(conversationId, summary, labels = []) {
    try {
        // 1. Add labels
        const allLabels = [exports.HANDOFF_LABELS.HANDOFF, ...labels];
        for (const label of allLabels) {
            try {
                await client_1.chatwootClient.addLabel(conversationId, label);
            }
            catch (labelError) {
                logging_1.logger.warn('Failed to add label', { conversationId: String(conversationId), label, error: labelError });
            }
        }
        // 2. Create internal note with summary
        const summaryText = generateHandoffSummary(summary);
        await client_1.chatwootClient.sendMessage({
            conversationId,
            content: summaryText,
            private: true, // Internal note
        });
        logging_1.logger.info('Handoff executed in Chatwoot', {
            conversationId: String(conversationId),
            labels: allLabels,
        });
    }
    catch (error) {
        logging_1.logger.error('Failed to execute handoff in Chatwoot', error, {
            conversationId: String(conversationId),
        });
        throw error;
    }
}
/**
 * Create transfer message for client
 */
function createTransferMessage() {
    return `Foi um prazer ajudar! 👋

Por agora, vou transferir você para um de nossos atendentes que poderá continuar te auxiliando com mais detalhes.

Aguarde um momento, por favor!`;
}
/**
 * Create waiting message during handoff
 */
function createWaitingMessage() {
    return `Aguarde um momento, por favor! 

Um de nossos atendentes vai assumir seu atendimento em instantes. ⏳`;
}
/**
 * Map intent to Chatwoot labels
 */
function getLabelsForIntent(intent, riskLevel) {
    const labels = [];
    switch (intent) {
        case 'possivel_urgencia':
            labels.push(exports.HANDOFF_LABELS.URGENT);
            break;
        case 'reclamacao':
            labels.push(exports.HANDOFF_LABELS.COMPLAINT);
            break;
        case 'financeiro_sensivel':
            labels.push(exports.HANDOFF_LABELS.FINANCIAL);
            break;
        case 'pedido_humano':
            labels.push(exports.HANDOFF_LABELS.ESCALATED);
            break;
    }
    // Add risk level label if high
    if (riskLevel === 'high') {
        labels.push(exports.HANDOFF_LABELS.URGENT);
    }
    return labels;
}
//# sourceMappingURL=integration.js.map
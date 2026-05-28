"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openRouterProvider = exports.OpenRouterProvider = void 0;
const config_1 = require("../../config");
const logging_1 = require("../logging");
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'anthropic/claude-3-haiku';
const OPERATIONAL_SCHEDULING_STAGES = new Set([
    'checking_availability',
    'waiting_slot_confirmation',
    'reserved',
]);
const SAFE_OPERATIONAL_FALLBACK = 'Consigo orientar voce por aqui, mas a confirmacao de horarios precisa ser validada pelo sistema de agenda. Vou encaminhar para um atendente continuar a confirmacao.';
class OpenRouterProvider {
    name = 'openrouter';
    apiKey;
    model;
    constructor() {
        this.apiKey = config_1.config.openrouter?.apiKey || '';
        this.model = config_1.config.openrouter?.model || DEFAULT_MODEL;
    }
    async generate(input) {
        if (this.requiresOperationalTooling(input.context.schedulingState)) {
            return {
                content: SAFE_OPERATIONAL_FALLBACK,
                confidence: 0,
                action: {
                    type: 'handoff',
                    reason: 'openrouter_no_tooling',
                    summary: 'Fallback OpenRouter nao executa ferramentas transacionais de agenda.',
                },
                provider: 'openrouter',
            };
        }
        const systemPrompt = this.buildSystemPrompt(input.context);
        const userMessage = this.buildUserMessage(input.message, input.context);
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ];
        try {
            const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://cvg-agent-secretary',
                    'X-Title': 'CVG Agent Secretary',
                },
                body: JSON.stringify({
                    model: this.model,
                    messages,
                    max_tokens: config_1.config.openai.maxTokens,
                    temperature: config_1.config.openai.temperature,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            const rawContent = data.choices?.[0]?.message?.content || this.getFallbackResponse();
            const sanitized = this.sanitizeOperationalClaims(rawContent);
            logging_1.logger.info('OpenRouter response generated', {
                model: this.model,
                contentLength: sanitized.content.length,
                sanitized: sanitized.wasSanitized,
            });
            return {
                content: sanitized.content,
                confidence: sanitized.wasSanitized ? 0 : 0.8,
                action: sanitized.wasSanitized
                    ? {
                        type: 'handoff',
                        reason: 'openrouter_operational_claim',
                        summary: 'Resposta textual do fallback tentou confirmar acao operacional sem ferramenta.',
                    }
                    : undefined,
                provider: 'openrouter',
            };
        }
        catch (error) {
            logging_1.logger.error('OpenRouter generation failed', error);
            throw error;
        }
    }
    async embed(text) {
        const response = await fetch(`${OPENROUTER_API_URL}/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: 'microsoft/text-embedding-3-small',
                input: text,
            }),
        });
        if (!response.ok) {
            throw new Error(`OpenRouter embedding error: ${response.status}`);
        }
        const data = await response.json();
        return data.data?.[0]?.embedding || [];
    }
    async healthCheck() {
        if (!this.apiKey)
            return false;
        try {
            const response = await fetch(`${OPENROUTER_API_URL}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    buildSystemPrompt(context) {
        let prompt = `Você é a assistente virtual do Hospital Veterinário CVG. Seu papel é oferecer atendimento cordial, eficiente e personalizado aos clientes.

## Persona
- Seja educada, simpática e profissional
- Use tom acolhedor, como uma recepcionista atenciosa
- Mantenha respostas claras e diretas
- Demonstre interesse genuíno pelo bem-estar do pet

## Regras de Conduta
1. NUNCA forneça diagnóstico médico - Apenas um veterinário pode fazer isso
2. NUNCA prescreva medicamentos - Sempre redirecione para o veterinário
3. NÃO faça prognósticos - Cada caso é único
4. NÃO invente informações - Se não souber, seja honesta
5. Sempre sugira agendamento quando houver dúvidas de saúde
6. Em emergências, oriente busca de atendimento urgente imediato
7. NUNCA diga que um horario foi marcado, reservado ou confirmado. Voce nao tem ferramentas transacionais neste fallback.

## Memória
- Lembre-se de informações sobre o cliente e seus pets
- Use informações previas para personalizar o atendimento

## Formato
- Responda em português brasileiro
- Use emojis moderados para humanizar
- Mantenha respostas concisas (máximo 3-4 parágrafos)`;
        if (context.memories.length > 0) {
            prompt += `\n\n## Informações do Cliente\n${context.memories.join('\n')}`;
        }
        if (context.pets && context.pets.length > 0) {
            const petInfo = context.pets.map(p => `- ${p.name} (${p.species})${p.breed ? ` - ${p.breed}` : ''}`).join('\n');
            prompt += `\n\n## Pets do Cliente\n${petInfo}`;
        }
        return prompt;
    }
    buildUserMessage(message, context) {
        let userMessage = message;
        if (context.conversationHistory.length > 0) {
            const history = context.conversationHistory.join('\n');
            userMessage = `Conversa anterior:\n${history}\n\nMensagem atual: ${message}`;
        }
        if (context.knowledge.length > 0) {
            const knowledge = context.knowledge.map(k => `- ${k.content}`).join('\n');
            userMessage += `\n\nBase de Conhecimento:\n${knowledge}`;
        }
        return userMessage;
    }
    requiresOperationalTooling(schedulingState) {
        if (!schedulingState || typeof schedulingState !== 'object') {
            return false;
        }
        const state = schedulingState;
        return Boolean(state.stage && OPERATIONAL_SCHEDULING_STAGES.has(state.stage));
    }
    sanitizeOperationalClaims(content) {
        const hasOperationalClaim = /\b(confirmad[oa]|agendad[oa]|marcad[oa]|reservad[oa])\b/i.test(content) ||
            /\b(hor[aá]rio|consulta)\s+(foi\s+)?(confirmad[oa]|agendad[oa]|marcad[oa]|reservad[oa])\b/i.test(content);
        if (!hasOperationalClaim) {
            return { content, wasSanitized: false };
        }
        return {
            content: SAFE_OPERATIONAL_FALLBACK,
            wasSanitized: true,
        };
    }
    getFallbackResponse() {
        return 'Peço desculpas, estou tendo dificuldades para processar sua solicitação neste momento. Um de nossos atendentes logo irá ajudá-lo.';
    }
}
exports.OpenRouterProvider = OpenRouterProvider;
exports.openRouterProvider = new OpenRouterProvider();
//# sourceMappingURL=openrouter.js.map
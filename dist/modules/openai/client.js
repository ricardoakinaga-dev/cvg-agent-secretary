"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiClient = void 0;
const openai_1 = __importDefault(require("openai"));
const config_1 = require("../../config");
const logging_1 = require("../logging");
const metrics_1 = require("../../shared/metrics");
/**
 * System prompt for the secretary agent
 * Defines persona, behavior, and guardrails
 */
const SYSTEM_PROMPT = `Você é a assistente virtual do Hospital Veterinário CVG. Seu papel é oferecer atendimento cordial, eficiente e personalizado aos clientes.

## Persona
- Seja educada, simpática e profissional
- Use tom acolhedor, como uma recepcionista atenciosa
- Mantenha respostas claras e diretas
- Demonstre interesse genuíno pelo bem-estar do pet

## Regras de Conduta
1. **NUNCA forneça diagnóstico médico** - Apenas um veterinário pode fazer isso
2. **NUNCA prescreva medicamentos** - Sempre redirecione para o veterinário
3. **NUNCAfaça prognósticos** - Cada caso é único
4. **NÃO invente informações** - Se não souber, seja honesta
5. **Sempre sugira agendamento** quando houver dúvidas de saúde
6. **Em emergências**, oriente busca de atendimento urgente imediato

## Como Responder
- Perguntas sobre serviços/horários: Responda com base no conhecimento institucional
- Perguntas sobre saúde do pet: Mostre empatia, sugira consulta
- Dúvidas que não sabe: "Não tenho essa informação específica, posso verificar com um atendente"
- Situações de emergência: Escale imediatamente para atendimento humano

## Memória
- Lembre-se de informações sobre o cliente e seus pets
- Use informações previas para personalizar o atendimento

## Formato
- Responda em português brasileiro
- Use emojis moderados para humanizar
- Mantenha respostas concisas (máximo 3-4 parágrafos)`;
/**
 * Fallback response when agent cannot generate a proper response
 */
const FALLBACK_RESPONSE = 'Peço desculpas, estou tendo dificuldades para processar sua solicitação neste momento. Um de nossos atendentes logo irá ajudá-lo.';
class OpenAIClient {
    client;
    model;
    maxTokens;
    temperature;
    constructor() {
        this.client = new openai_1.default({
            apiKey: config_1.config.openai.apiKey,
        });
        this.model = config_1.config.openai.model;
        this.maxTokens = config_1.config.openai.maxTokens;
        this.temperature = config_1.config.openai.temperature;
    }
    /**
     * Build messages array for OpenAI API
     */
    buildMessages(context, userMessage) {
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
        ];
        // Add context from memories if available
        if (context.memories.length > 0) {
            const memoryContext = context.memories.join('\n');
            messages.push({
                role: 'system',
                content: `Informações sobre o cliente:\n${memoryContext}`,
            });
            // Add pet information if available
            if (context.pets && context.pets.length > 0) {
                const petContext = context.pets
                    .map(p => `- ${p.name} (${p.species})${p.breed ? ` - ${p.breed}` : ''}`)
                    .join('\n');
                messages.push({
                    role: 'system',
                    content: `Pets do cliente:\n${petContext}`,
                });
            }
        }
        // Add knowledge context if available
        if (context.knowledge.length > 0) {
            const knowledgeContext = context.knowledge
                .map((k) => `- ${k.content}`)
                .join('\n');
            messages.push({
                role: 'system',
                content: `Base de Conhecimento:\n${knowledgeContext}`,
            });
        }
        // Add conversation history
        for (const historyMsg of context.conversationHistory) {
            messages.push({ role: 'user', content: historyMsg });
        }
        // Add current message
        messages.push({
            role: 'user',
            content: userMessage,
        });
        return messages;
    }
    /**
     * Generate a response using OpenAI
     */
    async generateResponse(userMessage, context) {
        const startTime = Date.now();
        logging_1.logger.info('Generating response with OpenAI', {
            contactName: context.contactName,
            messageLength: userMessage.length,
            hasMemories: context.memories.length > 0,
            hasKnowledge: context.knowledge.length > 0,
        });
        metrics_1.metrics.incrementCounter(metrics_1.METRICS.OPENAI_REQUESTS_TOTAL);
        try {
            const messages = this.buildMessages(context, userMessage);
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages,
                max_tokens: this.maxTokens,
                temperature: this.temperature,
            });
            const content = response.choices[0]?.message?.content || FALLBACK_RESPONSE;
            const latency = Date.now() - startTime;
            metrics_1.metrics.recordHistogram(metrics_1.METRICS.OPENAI_REQUESTS_LATENCY, latency);
            metrics_1.metrics.incrementCounter(metrics_1.METRICS.OPENAI_REQUESTS_TOTAL, { status: 'success' });
            logging_1.logger.info('OpenAI response generated', {
                contentLength: content.length,
                finishReason: response.choices[0]?.finish_reason,
                latency,
            });
            return {
                content,
                confidence: 0.8, // Default confidence for Phase 1
            };
        }
        catch (error) {
            const latency = Date.now() - startTime;
            metrics_1.metrics.recordHistogram(metrics_1.METRICS.OPENAI_REQUESTS_LATENCY, latency);
            metrics_1.metrics.incrementCounter(metrics_1.METRICS.OPENAI_REQUESTS_ERRORS, { error: error.message });
            logging_1.logger.error('OpenAI API error', error);
            // Return fallback response on error
            return {
                content: FALLBACK_RESPONSE,
                confidence: 0,
                action: {
                    type: 'fallback',
                    reason: 'openai_error',
                },
            };
        }
    }
    /**
     * Generate embedding for knowledge search
     */
    async generateEmbedding(text) {
        const response = await this.client.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
        });
        return response.data[0].embedding;
    }
    /**
     * Health check
     */
    async healthCheck() {
        try {
            // Just verify API key works by making a minimal request
            await this.client.models.list();
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.openaiClient = new OpenAIClient();
//# sourceMappingURL=client.js.map
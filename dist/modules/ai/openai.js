"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openAIProvider = exports.OpenAIProvider = void 0;
const client_1 = require("../openai/client");
class OpenAIProvider {
    name = 'openai';
    async generate(input) {
        const response = await client_1.openaiClient.generateResponse(input.message, input.context);
        return {
            content: response.content,
            confidence: response.confidence,
            action: response.action,
            provider: 'openai',
        };
    }
    async embed(text) {
        return client_1.openaiClient.generateEmbedding(text);
    }
    async healthCheck() {
        return client_1.openaiClient.healthCheck();
    }
}
exports.OpenAIProvider = OpenAIProvider;
exports.openAIProvider = new OpenAIProvider();
//# sourceMappingURL=openai.js.map
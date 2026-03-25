"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRouter = exports.AIRouter = void 0;
const openai_1 = require("./openai");
const openrouter_1 = require("./openrouter");
const config_1 = require("../../config");
const logging_1 = require("../logging");
const metrics_1 = require("../../shared/metrics");
const resilience_1 = require("../../shared/resilience");
class AIRouter {
    primaryProvider;
    fallbackProvider;
    providerType;
    primaryCircuitBreaker;
    fallbackCircuitBreaker;
    constructor() {
        this.providerType = this.resolveProviderType(config_1.config.aiProvider);
        if (this.providerType === 'openrouter') {
            this.primaryProvider = openrouter_1.openRouterProvider;
            this.fallbackProvider = openai_1.openAIProvider;
        }
        else {
            this.primaryProvider = openai_1.openAIProvider;
            this.fallbackProvider = openrouter_1.openRouterProvider;
        }
        this.primaryCircuitBreaker = new resilience_1.CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30000 });
        this.fallbackCircuitBreaker = new resilience_1.CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60000 });
        logging_1.logger.info('AI Router initialized', {
            primary: this.primaryProvider.name,
            fallback: this.fallbackProvider.name,
        });
    }
    resolveProviderType(type) {
        if (type === 'auto') {
            return 'openai';
        }
        return type;
    }
    async generate(input) {
        const startTime = Date.now();
        const primaryProviderName = this.primaryProvider.name;
        if (primaryProviderName === 'openai') {
            metrics_1.metrics.incrementCounter(metrics_1.METRICS.OPENAI_REQUESTS_TOTAL);
        }
        else {
            metrics_1.metrics.incrementCounter(metrics_1.METRICS.OPENROUTER_REQUESTS_TOTAL);
        }
        const primaryOpen = this.primaryCircuitBreaker.getStatus() !== 'open';
        if (primaryOpen) {
            try {
                const result = await this.primaryCircuitBreaker.execute(() => this.primaryProvider.generate(input));
                const latency = Date.now() - startTime;
                if (primaryProviderName === 'openai') {
                    metrics_1.metrics.recordHistogram(metrics_1.METRICS.OPENAI_REQUESTS_LATENCY, latency);
                }
                else {
                    metrics_1.metrics.recordHistogram(metrics_1.METRICS.OPENROUTER_REQUESTS_LATENCY, latency);
                }
                logging_1.logger.info('Primary provider succeeded', { provider: this.primaryProvider.name, latency });
                return result;
            }
            catch (error) {
                logging_1.logger.warn(`Primary provider failed: ${error.message}`, {
                    primary: this.primaryProvider.name,
                });
                if (primaryProviderName === 'openai') {
                    metrics_1.metrics.incrementCounter(metrics_1.METRICS.OPENAI_REQUESTS_ERRORS, {
                        error: error.message.substring(0, 50),
                    });
                }
                else {
                    metrics_1.metrics.incrementCounter(metrics_1.METRICS.OPENROUTER_REQUESTS_ERRORS, {
                        error: error.message.substring(0, 50),
                    });
                }
            }
        }
        else {
            logging_1.logger.warn('Primary circuit breaker open, skipping to fallback', { provider: this.primaryProvider.name });
        }
        const fallbackOpen = this.fallbackCircuitBreaker.getStatus() !== 'open';
        if (fallbackOpen) {
            try {
                const fallbackStartTime = Date.now();
                const fallbackResult = await this.fallbackCircuitBreaker.execute(() => this.fallbackProvider.generate(input));
                const fallbackLatency = Date.now() - fallbackStartTime;
                if (this.fallbackProvider.name === 'openai') {
                    metrics_1.metrics.recordHistogram(metrics_1.METRICS.OPENAI_REQUESTS_LATENCY, fallbackLatency);
                }
                else {
                    metrics_1.metrics.recordHistogram(metrics_1.METRICS.OPENROUTER_REQUESTS_LATENCY, fallbackLatency);
                }
                metrics_1.metrics.incrementCounter(metrics_1.METRICS.OPENAI_REQUESTS_FALLBACK, {
                    from: this.primaryProvider.name,
                    to: this.fallbackProvider.name,
                });
                metrics_1.metrics.incrementCounter(metrics_1.METRICS.AI_PROVIDER_SWITCHES, {
                    from: this.primaryProvider.name,
                    to: this.fallbackProvider.name,
                });
                logging_1.logger.info('Fallback provider succeeded', { provider: this.fallbackProvider.name, fallbackLatency });
                return fallbackResult;
            }
            catch (fallbackError) {
                logging_1.logger.error('Fallback provider also failed', fallbackError);
                if (this.fallbackProvider.name === 'openai') {
                    metrics_1.metrics.incrementCounter(metrics_1.METRICS.OPENAI_REQUESTS_ERRORS, {
                        error: fallbackError.message.substring(0, 50),
                    });
                }
                else {
                    metrics_1.metrics.incrementCounter(metrics_1.METRICS.OPENROUTER_REQUESTS_ERRORS, {
                        error: fallbackError.message.substring(0, 50),
                    });
                }
            }
        }
        else {
            logging_1.logger.error('Both circuit breakers open', undefined, { primary: this.primaryProvider.name, fallback: this.fallbackProvider.name });
        }
        return {
            content: 'Peço desculpas, estou tendo dificuldades para processar sua solicitação neste momento. Um de nossos atendentes logo irá ajudá-lo.',
            confidence: 0,
            action: {
                type: 'fallback',
                reason: 'all_providers_failed',
            },
            provider: 'none',
        };
    }
    async embed(text) {
        try {
            return await this.primaryProvider.embed?.(text) || [];
        }
        catch {
            try {
                return await this.fallbackProvider.embed?.(text) || [];
            }
            catch (error) {
                logging_1.logger.error('Embedding failed on all providers', error);
                return [];
            }
        }
    }
    async healthCheck() {
        const primaryHealth = await this.primaryProvider.healthCheck();
        if (primaryHealth)
            return true;
        const fallbackHealth = await this.fallbackProvider.healthCheck();
        return fallbackHealth;
    }
    getPrimaryProvider() {
        return this.primaryProvider.name;
    }
    getFallbackProvider() {
        return this.fallbackProvider.name;
    }
    getProviderType() {
        return this.providerType;
    }
}
exports.AIRouter = AIRouter;
exports.aiRouter = new AIRouter();
//# sourceMappingURL=router.js.map
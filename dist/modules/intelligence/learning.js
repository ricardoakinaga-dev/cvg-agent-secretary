"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.learningLoopService = exports.LearningLoopService = void 0;
const uuid_1 = require("uuid");
const logging_1 = require("../logging");
const db_1 = require("../../shared/db");
class LearningLoopService {
    async recordFeedback(input) {
        const id = (0, uuid_1.v4)();
        const sql = `
      INSERT INTO response_feedback (
        id, conversation_id, message_id, query, response, quality,
        failure_type, feedback, useful_chunks, provider, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
        try {
            const result = await (0, db_1.query)(sql, [
                id,
                input.conversationId,
                input.messageId,
                input.query,
                input.response,
                input.quality,
                input.failureType || null,
                input.feedback || null,
                JSON.stringify(input.usefulChunks || []),
                input.provider,
                new Date(),
            ]);
            logging_1.logger.info('Response feedback recorded', {
                id,
                quality: input.quality,
                failureType: input.failureType,
            });
            return this.mapToFeedback(result.rows[0]);
        }
        catch (error) {
            logging_1.logger.error('Failed to record feedback', error);
            throw error;
        }
    }
    async getRecentFeedback(limit = 50) {
        const sql = `
      SELECT * FROM response_feedback
      ORDER BY created_at DESC
      LIMIT $1
    `;
        try {
            const result = await (0, db_1.query)(sql, [limit]);
            return result.rows.map(row => this.mapToFeedback(row));
        }
        catch (error) {
            logging_1.logger.error('Failed to get feedback', error);
            return [];
        }
    }
    async getQualityStats(days = 7) {
        const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE quality = 'good') as good,
        COUNT(*) FILTER (WHERE quality = 'neutral') as neutral,
        COUNT(*) FILTER (WHERE quality = 'poor') as poor,
        COUNT(*) FILTER (WHERE quality = 'failed') as failed,
        AVG(CASE 
          WHEN quality = 'good' THEN 1.0
          WHEN quality = 'neutral' THEN 0.5
          WHEN quality = 'poor' THEN 0.25
          WHEN quality = 'failed' THEN 0
          ELSE 0.5
        END) as average_quality
      FROM response_feedback
      WHERE created_at > NOW() - INTERVAL '${days} days'
    `;
        try {
            const result = await (0, db_1.query)(sql);
            const row = result.rows[0];
            return {
                total: parseInt(row.total) || 0,
                good: parseInt(row.good) || 0,
                neutral: parseInt(row.neutral) || 0,
                poor: parseInt(row.poor) || 0,
                failed: parseInt(row.failed) || 0,
                averageQuality: parseFloat(row.average_quality) || 0.5,
            };
        }
        catch (error) {
            logging_1.logger.error('Failed to get quality stats', error);
            return {
                total: 0, good: 0, neutral: 0, poor: 0, failed: 0, averageQuality: 0
            };
        }
    }
    async getCommonFailures(limit = 10) {
        const sql = `
      SELECT 
        failure_type,
        COUNT(*) as count,
        ARRAY_AGG(query ORDER BY RANDOM() LIMIT 3) as example_queries
      FROM response_feedback
      WHERE failure_type IS NOT NULL
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY failure_type
      ORDER BY count DESC
      LIMIT $1
    `;
        try {
            const result = await (0, db_1.query)(sql, [limit]);
            return result.rows.map((row) => ({
                failureType: row.failure_type,
                count: parseInt(row.count),
                exampleQueries: row.example_queries || [],
            }));
        }
        catch (error) {
            logging_1.logger.error('Failed to get common failures', error);
            return [];
        }
    }
    async identifyKnowledgeGaps() {
        const failures = await this.getCommonFailures(10);
        const insights = [];
        for (const failure of failures) {
            if (failure.count >= 3) {
                insights.push({
                    id: (0, uuid_1.v4)(),
                    insightType: 'knowledge_gap',
                    description: `Frequent failures (${failure.count}) related to: ${failure.failureType.replace('_', ' ')}`,
                    evidence: failure.exampleQueries,
                    frequency: failure.count,
                    createdAt: new Date(),
                });
            }
        }
        return insights;
    }
    mapToFeedback(row) {
        return {
            id: row.id,
            conversationId: row.conversation_id,
            messageId: row.message_id,
            query: row.query,
            response: row.response,
            quality: row.quality,
            failureType: row.failure_type,
            feedback: row.feedback || undefined,
            usefulChunks: row.useful_chunks || [],
            provider: row.provider,
            createdAt: new Date(row.created_at),
        };
    }
}
exports.LearningLoopService = LearningLoopService;
exports.learningLoopService = new LearningLoopService();
//# sourceMappingURL=learning.js.map
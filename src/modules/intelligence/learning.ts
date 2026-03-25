import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logging';
import { query } from '../../shared/db';

export type ResponseQuality = 'good' | 'neutral' | 'poor' | 'failed';
export type FailureType = 'irrelevant_knowledge' | 'wrong_classification' | 'provider_error' | 'context_missing' | 'unknown';

interface QualityStatsRow {
  total: string;
  good: string;
  neutral: string;
  poor: string;
  failed: string;
  average_quality: string;
}

interface FailureRow {
  failure_type: string;
  count: string;
  example_queries: string[];
}

interface FeedbackRow {
  id: string;
  conversation_id: string;
  message_id: string;
  query: string;
  response: string;
  quality: string;
  failure_type: string | null;
  feedback: string | null;
  useful_chunks: string[];
  provider: string;
  created_at: string;
}

export interface ResponseFeedback {
  id: string;
  conversationId: string;
  messageId: string;
  query: string;
  response: string;
  quality: ResponseQuality;
  failureType?: FailureType;
  feedback?: string;
  usefulChunks: string[];
  provider: string;
  createdAt: Date;
}

export interface CreateFeedbackInput {
  conversationId: string;
  messageId: string;
  query: string;
  response: string;
  quality: ResponseQuality;
  failureType?: FailureType;
  feedback?: string;
  usefulChunks?: string[];
  provider: string;
}

export interface LearningInsight {
  id: string;
  insightType: 'knowledge_gap' | 'pattern' | 'improvement';
  description: string;
  evidence: string[];
  frequency: number;
  createdAt: Date;
}

export class LearningLoopService {
  async recordFeedback(input: CreateFeedbackInput): Promise<ResponseFeedback> {
    const id = uuidv4();
    
    const sql = `
      INSERT INTO response_feedback (
        id, conversation_id, message_id, query, response, quality,
        failure_type, feedback, useful_chunks, provider, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    try {
      const result = await query(sql, [
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

      logger.info('Response feedback recorded', {
        id,
        quality: input.quality,
        failureType: input.failureType,
      });

      return this.mapToFeedback(result.rows[0] as unknown as FeedbackRow);
    } catch (error) {
      logger.error('Failed to record feedback', error as Error);
      throw error;
    }
  }

  async getRecentFeedback(limit = 50): Promise<ResponseFeedback[]> {
    const sql = `
      SELECT * FROM response_feedback
      ORDER BY created_at DESC
      LIMIT $1
    `;

    try {
      const result = await query(sql, [limit]);
      return result.rows.map(row => this.mapToFeedback(row as unknown as FeedbackRow));
    } catch (error) {
      logger.error('Failed to get feedback', error as Error);
      return [];
    }
  }

  async getQualityStats(days = 7): Promise<{
    total: number;
    good: number;
    neutral: number;
    poor: number;
    failed: number;
    averageQuality: number;
  }> {
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
      const result = await query<QualityStatsRow>(sql);
      const row = result.rows[0];
      return {
        total: parseInt(row.total) || 0,
        good: parseInt(row.good) || 0,
        neutral: parseInt(row.neutral) || 0,
        poor: parseInt(row.poor) || 0,
        failed: parseInt(row.failed) || 0,
        averageQuality: parseFloat(row.average_quality) || 0.5,
      };
    } catch (error) {
      logger.error('Failed to get quality stats', error as Error);
      return {
        total: 0, good: 0, neutral: 0, poor: 0, failed: 0, averageQuality: 0
      };
    }
  }

  async getCommonFailures(limit = 10): Promise<Array<{
    failureType: FailureType;
    count: number;
    exampleQueries: string[];
  }>> {
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
      const result = await query<FailureRow>(sql, [limit]);
      return result.rows.map((row) => ({
        failureType: row.failure_type as FailureType,
        count: parseInt(row.count),
        exampleQueries: row.example_queries || [],
      }));
    } catch (error) {
      logger.error('Failed to get common failures', error as Error);
      return [];
    }
  }

  async identifyKnowledgeGaps(): Promise<LearningInsight[]> {
    const failures = await this.getCommonFailures(10);
    const insights: LearningInsight[] = [];

    for (const failure of failures) {
      if (failure.count >= 3) {
        insights.push({
          id: uuidv4(),
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

  private mapToFeedback(row: FeedbackRow): ResponseFeedback {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      query: row.query,
      response: row.response,
      quality: row.quality as ResponseQuality,
      failureType: row.failure_type as FailureType | undefined,
      feedback: row.feedback || undefined,
      usefulChunks: row.useful_chunks || [],
      provider: row.provider,
      createdAt: new Date(row.created_at),
    };
  }
}

export const learningLoopService = new LearningLoopService();
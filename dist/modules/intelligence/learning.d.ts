export type ResponseQuality = 'good' | 'neutral' | 'poor' | 'failed';
export type FailureType = 'irrelevant_knowledge' | 'wrong_classification' | 'provider_error' | 'context_missing' | 'unknown';
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
export declare class LearningLoopService {
    recordFeedback(input: CreateFeedbackInput): Promise<ResponseFeedback>;
    getRecentFeedback(limit?: number): Promise<ResponseFeedback[]>;
    getQualityStats(days?: number): Promise<{
        total: number;
        good: number;
        neutral: number;
        poor: number;
        failed: number;
        averageQuality: number;
    }>;
    getCommonFailures(limit?: number): Promise<Array<{
        failureType: FailureType;
        count: number;
        exampleQueries: string[];
    }>>;
    identifyKnowledgeGaps(): Promise<LearningInsight[]>;
    private mapToFeedback;
}
export declare const learningLoopService: LearningLoopService;
//# sourceMappingURL=learning.d.ts.map
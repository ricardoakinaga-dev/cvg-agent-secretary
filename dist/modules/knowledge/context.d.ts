import { KnowledgeChunk } from '../../shared/types';
export declare function isPricingQuery(query: string): boolean;
export declare function isHoursQuery(query: string): boolean;
export declare function extractPrices(text: string): string[];
export declare function buildKnowledgeContext(query: string, chunks: KnowledgeChunk[]): KnowledgeChunk[];
export declare function hasPriceEvidence(chunks: KnowledgeChunk[]): boolean;
export declare function hasHoursEvidence(chunks: KnowledgeChunk[]): boolean;
export declare function supportedPrices(chunks: KnowledgeChunk[]): string[];
export declare function hasWalkInServiceEvidence(query: string, chunks: KnowledgeChunk[]): boolean;
export declare function buildWalkInServiceResponse(query: string, chunks: KnowledgeChunk[]): string;
export declare function hasSchedulingPolicyEvidence(chunks: KnowledgeChunk[]): boolean;
export declare function containsSchedulingProposal(text: string): boolean;
export declare function isServiceAvailabilityQuery(query: string): boolean;
export declare function isSchedulingRequest(query: string): boolean;
export declare function buildServiceAvailabilityResponse(query: string, chunks: KnowledgeChunk[]): string;
//# sourceMappingURL=context.d.ts.map
import { KnowledgeChunk } from '../../shared/types';
export declare function isPricingQuery(query: string): boolean;
export declare function isHoursQuery(query: string): boolean;
export declare function extractPrices(text: string): string[];
export declare function buildKnowledgeContext(query: string, chunks: KnowledgeChunk[]): KnowledgeChunk[];
export declare function hasPriceEvidence(chunks: KnowledgeChunk[]): boolean;
export declare function hasHoursEvidence(chunks: KnowledgeChunk[]): boolean;
export declare function supportedPrices(chunks: KnowledgeChunk[]): string[];
//# sourceMappingURL=context.d.ts.map
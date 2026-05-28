import { config } from '../../config';
import { logger } from '../logging';
import {
  KnowledgeCategory,
  KnowledgeChunk,
  KnowledgeSearchResult,
  VectorStoreInterface,
} from './types';

interface QdrantPoint {
  id: string;
  score?: number;
  payload?: {
    documentId: string;
    chunkIndex: number;
    content: string;
    tokenCount?: number;
    title?: string;
    category: KnowledgeCategory;
    tags: string[];
    version: number;
    source: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

interface QdrantSearchResponse {
  result?: QdrantPoint[];
}

function chunkToPayload(chunk: KnowledgeChunk): QdrantPoint['payload'] {
  return {
    documentId: chunk.documentId,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    tokenCount: chunk.tokenCount,
    title: chunk.title,
    category: chunk.category,
    tags: chunk.tags,
    version: chunk.version,
    source: chunk.source,
    isActive: chunk.isActive,
    createdAt: chunk.createdAt.toISOString(),
    updatedAt: chunk.updatedAt.toISOString(),
  };
}

function pointToSearchResult(point: QdrantPoint): KnowledgeSearchResult | null {
  if (!point.payload) return null;

  return {
    relevance: point.score || 0,
    documentTitle: point.payload.title,
    chunk: {
      id: point.id,
      documentId: point.payload.documentId,
      chunkIndex: point.payload.chunkIndex,
      content: point.payload.content,
      tokenCount: point.payload.tokenCount,
      title: point.payload.title,
      category: point.payload.category,
      tags: point.payload.tags,
      version: point.payload.version,
      source: point.payload.source as KnowledgeChunk['source'],
      isActive: point.payload.isActive,
      createdAt: new Date(point.payload.createdAt),
      updatedAt: new Date(point.payload.updatedAt),
    },
  };
}

export class QdrantVectorStore implements VectorStoreInterface {
  private url: string;
  private apiKey: string;
  private collection: string;
  private dimensions: number;

  constructor(dimensions: number) {
    this.url = config.qdrant.url.replace(/\/$/, '');
    this.apiKey = config.qdrant.apiKey;
    this.collection = config.qdrant.collection;
    this.dimensions = dimensions;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { 'api-key': this.apiKey } : {}),
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.url) {
      throw new Error('QDRANT_URL is not configured');
    }

    const response = await fetch(`${this.url}${path}`, {
      ...init,
      headers: {
        ...this.headers(),
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qdrant API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  async initialize(): Promise<void> {
    await this.request(`/collections/${this.collection}`, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: {
          size: this.dimensions,
          distance: 'Cosine',
        },
      }),
    });

    logger.info('Qdrant vector store initialized', {
      collection: this.collection,
      dimensions: this.dimensions,
    });
  }

  async addChunks(chunks: KnowledgeChunk[]): Promise<void> {
    const points = chunks
      .filter((chunk) => chunk.embedding && chunk.embedding.length > 0)
      .map((chunk) => ({
        id: chunk.id,
        vector: chunk.embedding,
        payload: chunkToPayload(chunk),
      }));

    if (points.length === 0) {
      return;
    }

    await this.request(`/collections/${this.collection}/points?wait=true`, {
      method: 'PUT',
      body: JSON.stringify({ points }),
    });
  }

  async search(
    _query: string,
    embedding: number[],
    options: { limit: number; minRelevance: number; category?: string }
  ): Promise<KnowledgeSearchResult[]> {
    const filter = options.category
      ? {
          must: [
            {
              key: 'category',
              match: { value: options.category },
            },
          ],
        }
      : undefined;

    const response = await this.request<QdrantSearchResponse>(
      `/collections/${this.collection}/points/search`,
      {
        method: 'POST',
        body: JSON.stringify({
          vector: embedding,
          limit: options.limit,
          score_threshold: options.minRelevance,
          with_payload: true,
          filter,
        }),
      }
    );

    return (response.result || [])
      .map(pointToSearchResult)
      .filter((result): result is KnowledgeSearchResult => result !== null);
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.request(`/collections/${this.collection}/points/delete?wait=true`, {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: 'documentId',
              match: { value: documentId },
            },
          ],
        },
      }),
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request(`/collections/${this.collection}`);
      return true;
    } catch (error) {
      logger.warn('Qdrant health check failed', { error: (error as Error).message });
      return false;
    }
  }
}

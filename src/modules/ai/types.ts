import type { ContactRole } from '../../shared/types';

/** Stable boundary implemented by every model adapter and consumed by AIRouter. */
export interface AIProvider {
  readonly name: string;
  generate(input: GenerateInput): Promise<GenerateOutput>;
  embed?(text: string): Promise<number[]>;
  healthCheck(): Promise<boolean>;
}

export interface GenerateInput {
  message: string;
  context: AgentContext;
}

export interface AgentContext {
  conversationId?: string;
  contactId?: string;
  schedulingState?: unknown;
  contactName: string;
  conversationHistory: string[];
  memories: string[];
  pets?: Array<{
    id: string;
    name: string;
    species: string;
    breed: string | null;
  }>;
  knowledge: Array<{
    id: string;
    content: string;
    source: string;
    relevance: number;
    category?: string;
    title?: string;
  }>;
  contactIntake?: {
    contactRole: ContactRole;
    contactReason: string;
  };
}

export interface GenerateOutput {
  content: string;
  confidence: number;
  action?: {
    type: 'respond' | 'handoff' | 'fallback';
    reason?: string;
    summary?: string;
    content?: string;
  };
  provider?: string;
}

export type ProviderType = 'openai' | 'openrouter' | 'auto';

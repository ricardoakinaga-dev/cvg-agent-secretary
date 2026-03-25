// API Contracts - Phase 5A Enterprise
// Internal API type definitions for consistent interfaces

// ============================================================================
// Analytics API
// ============================================================================

export interface DashboardResponse {
  summary: {
    period: {
      since: string;
      to: string;
    };
    conversations: {
      started: number;
      ended: number;
    };
    messages: {
      received: number;
      sent: number;
    };
    handoffs: {
      total: number;
      rate: string;
    };
    fallbacks: {
      total: number;
    };
    errors: {
      total: number;
    };
    performance: {
      avgResponseLatency: string;
      autoResolutionRate: string;
    };
  };
  providers: {
    openai: {
      requests: number;
      errors: number;
      errorRate: string;
    };
    openrouter: {
      requests: number;
      errors: number;
      errorRate: string;
    };
  };
}

export interface OperationalReportResponse {
  reportType: 'operational';
  period: {
    since: string;
    to: string;
    days: number;
  };
  kpis: {
    conversationVolume: number;
    autoResolutionRate: string;
    handoffRate: string;
    fallbackRate: string;
    avgResponseLatencyMs: number;
  };
  providers: {
    openai: {
      requests: number;
      errors: number;
      reliability: string;
    };
    openrouter: {
      requests: number;
      errors: number;
      reliability: string;
    };
  };
  healthIndicators: {
    systemStatus: 'healthy' | 'degraded';
    errorCount: number;
    handoffCount: number;
    fallbackCount: number;
  };
}

// ============================================================================
// Audit API
// ============================================================================

export interface AuditEventResponse {
  id: string;
  eventType: string;
  actor: string;
  resourceType: string;
  resourceId: string;
  action: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface AuditEventsListResponse {
  events: AuditEventResponse[];
  count: number;
}

export interface AuditEventsQuery {
  eventType?: string;
  actor?: string;
  since?: string;
  limit?: number;
}

// ============================================================================
// Health API
// ============================================================================

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  dependencies: {
    redis: 'connected' | 'disconnected' | 'error';
    postgres: 'connected' | 'disconnected' | 'error';
    chatwoot: 'connected' | 'disconnected' | 'error';
    openai: 'connected' | 'disconnected' | 'error';
  };
}

export interface ReadinessResponse {
  ready: boolean;
  timestamp: string;
}

// ============================================================================
// Knowledge API
// ============================================================================

export interface KnowledgeSearchRequest {
  query: string;
  category?: string;
  limit?: number;
}

export interface KnowledgeSearchResponse {
  results: Array<{
    id: string;
    title: string;
    content: string;
    category: string;
    relevance: number;
  }>;
  count: number;
}

export interface KnowledgeDocumentResponse {
  id: string;
  title: string;
  content: string;
  category: string;
  source: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Ingestion API
// ============================================================================

export interface IngestionRequest {
  rawContent: string;
  source: string;
  title?: string;
}

export interface IngestionResponse {
  success: boolean;
  ingestionId: string;
  status: string;
  message: string;
  knowledgeDocumentId?: string;
}

export interface IngestionApprovalRequest {
  approvedBy: string;
}

export interface IngestionRejectionRequest {
  rejectedBy: string;
  reason: string;
}

// ============================================================================
// Webhook API
// ============================================================================

export interface WebhookResponse {
  success: boolean;
  correlationId?: string;
}

export interface WebhookErrorResponse {
  success: false;
  error: string;
}

// ============================================================================
// Error Responses
// ============================================================================

export interface ErrorResponse {
  error: string;
  message?: string;
  correlationId?: string;
}

export interface ValidationErrorResponse extends ErrorResponse {
  errors: Array<{
    field: string;
    message: string;
  }>;
}

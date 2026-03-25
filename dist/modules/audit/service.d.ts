export type AuditEventType = 'handoff_triggered' | 'knowledge_published' | 'knowledge_rejected' | 'knowledge_updated' | 'ingestion_approved' | 'ingestion_rejected' | 'user_action' | 'system_error' | 'config_change' | 'login' | 'logout' | 'role_change';
export interface AuditEvent {
    id: string;
    eventType: AuditEventType;
    actor: string;
    resourceType: string;
    resourceId: string;
    action: string;
    details: Record<string, unknown>;
    ipAddress?: string;
    createdAt: Date;
}
export interface CreateAuditEventInput {
    eventType: AuditEventType;
    actor: string;
    resourceType: string;
    resourceId: string;
    action: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
}
declare class AuditService {
    recordEvent(input: CreateAuditEventInput): Promise<void>;
    getEvents(filters?: {
        eventType?: AuditEventType;
        actor?: string;
        resourceType?: string;
        since?: Date;
        limit?: number;
    }): Promise<AuditEvent[]>;
    private mapRowToEvent;
}
export declare const auditService: AuditService;
export {};
//# sourceMappingURL=service.d.ts.map
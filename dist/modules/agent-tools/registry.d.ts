import { ChatCompletionTool } from 'openai/resources/chat/completions';
export interface AgentToolContext {
    conversationId?: string;
    contactId?: string;
    contactName?: string;
}
export type AgentToolName = 'search_knowledge' | 'check_available_slots' | 'reserve_slot' | 'confirm_appointment' | 'cancel_appointment' | 'reschedule_appointment' | 'create_handoff' | 'notify_sector';
export declare function getOpenAITools(): ChatCompletionTool[];
export declare function executeAgentTool(name: string, rawArguments: string, context: AgentToolContext): Promise<unknown>;
//# sourceMappingURL=registry.d.ts.map
import { NormalizedChannelMessage } from './types';
import type { ChannelType } from './types';
import { ChatwootWebhookPayload } from '../../shared/types';
export declare function normalizeFromChatwoot(payload: ChatwootWebhookPayload): NormalizedChannelMessage | null;
export declare function normalizeFromTelegram(update: TelegramUpdate): NormalizedChannelMessage | null;
export declare function normalizeFromWhatsapp(payload: WhatsAppWebhookPayload): NormalizedChannelMessage | null;
export declare function detectChannelType(source: string): ChannelType;
export declare function isValidChannelMessage(msg: NormalizedChannelMessage): boolean;
export interface TelegramUpdate {
    update_id: number;
    message?: {
        message_id: number;
        from?: {
            id: number;
            is_bot: boolean;
            first_name?: string;
            last_name?: string;
            username?: string;
            language_code?: string;
        };
        chat: {
            id: number;
            type: string;
            title?: string;
            username?: string;
            first_name?: string;
            last_name?: string;
        };
        date: number;
        text?: string;
    };
}
export interface WhatsAppWebhookPayload {
    object: string;
    entry: Array<{
        id: string;
        changes: Array<{
            value: {
                messaging_product: string;
                metadata: {
                    display_phone_number: string;
                    phone_number_id: string;
                };
                messages?: Array<{
                    from: string;
                    id: string;
                    timestamp: string;
                    text?: {
                        body: string;
                    };
                }>;
                contacts?: Array<{
                    profile: {
                        name: string;
                    };
                    wa_id: string;
                }>;
            };
            field: string;
        }>;
    }>;
}
//# sourceMappingURL=normalizer.d.ts.map
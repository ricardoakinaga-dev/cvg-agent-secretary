import { ChannelResponse } from './types';
export declare class WhatsAppProvider {
    private apiUrl;
    private apiKey;
    private instance;
    constructor();
    isEnabled(): boolean;
    sendMessage(phoneNumber: string, content: string): Promise<ChannelResponse>;
    sendMediaMessage(phoneNumber: string, mediaUrl: string, caption?: string): Promise<ChannelResponse>;
    healthCheck(): Promise<boolean>;
    getInstanceStatus(): Promise<{
        connected: boolean;
        name: string;
    }>;
}
export declare const whatsappProvider: WhatsAppProvider;
//# sourceMappingURL=whatsapp.d.ts.map
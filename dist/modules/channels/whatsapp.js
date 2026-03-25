"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappProvider = exports.WhatsAppProvider = void 0;
const logging_1 = require("../logging");
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || '';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const WHATSAPP_INSTANCE = process.env.WHATSAPP_INSTANCE || 'default';
class WhatsAppProvider {
    apiUrl;
    apiKey;
    instance;
    constructor() {
        this.apiUrl = EVOLUTION_API_URL;
        this.apiKey = EVOLUTION_API_KEY;
        this.instance = WHATSAPP_INSTANCE;
    }
    isEnabled() {
        return Boolean(this.apiUrl && this.apiKey);
    }
    async sendMessage(phoneNumber, content) {
        if (!this.isEnabled()) {
            return {
                success: false,
                channel: 'whatsapp',
                error: 'WhatsApp provider not configured',
            };
        }
        try {
            const response = await fetch(`${this.apiUrl}/message/sendText/${this.instance}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.apiKey,
                },
                body: JSON.stringify({
                    number: phoneNumber,
                    text: content,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Evolution API error: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            logging_1.logger.info('WhatsApp message sent', { phoneNumber, messageId: data.key?.id });
            return {
                success: true,
                messageId: data.key?.id,
                channel: 'whatsapp',
            };
        }
        catch (error) {
            logging_1.logger.error('WhatsApp send failed', error);
            return {
                success: false,
                channel: 'whatsapp',
                error: error.message,
            };
        }
    }
    async sendMediaMessage(phoneNumber, mediaUrl, caption) {
        if (!this.isEnabled()) {
            return {
                success: false,
                channel: 'whatsapp',
                error: 'WhatsApp provider not configured',
            };
        }
        try {
            const response = await fetch(`${this.apiUrl}/message/sendMedia/${this.instance}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.apiKey,
                },
                body: JSON.stringify({
                    number: phoneNumber,
                    mediaUrl,
                    caption,
                }),
            });
            if (!response.ok) {
                throw new Error(`Evolution API error: ${response.status}`);
            }
            const data = await response.json();
            return {
                success: true,
                messageId: data.key?.id,
                channel: 'whatsapp',
            };
        }
        catch (error) {
            logging_1.logger.error('WhatsApp media send failed', error);
            return {
                success: false,
                channel: 'whatsapp',
                error: error.message,
            };
        }
    }
    async healthCheck() {
        if (!this.isEnabled())
            return false;
        try {
            const response = await fetch(`${this.apiUrl}/instance/connectionState/${this.instance}`, {
                headers: { 'apikey': this.apiKey },
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async getInstanceStatus() {
        if (!this.isEnabled()) {
            return { connected: false, name: this.instance };
        }
        try {
            const response = await fetch(`${this.apiUrl}/instance/connectionState/${this.instance}`, {
                headers: { 'apikey': this.apiKey },
            });
            if (!response.ok) {
                return { connected: false, name: this.instance };
            }
            const data = await response.json();
            return {
                connected: data.instance?.connectionStatus === 'open',
                name: this.instance,
            };
        }
        catch {
            return { connected: false, name: this.instance };
        }
    }
}
exports.WhatsAppProvider = WhatsAppProvider;
exports.whatsappProvider = new WhatsAppProvider();
//# sourceMappingURL=whatsapp.js.map
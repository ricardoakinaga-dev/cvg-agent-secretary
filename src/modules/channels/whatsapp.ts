import { ChannelResponse } from './types';
import { logger } from '../logging';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || '';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const WHATSAPP_INSTANCE = process.env.WHATSAPP_INSTANCE || 'default';

export class WhatsAppProvider {
  private apiUrl: string;
  private apiKey: string;
  private instance: string;

  constructor() {
    this.apiUrl = EVOLUTION_API_URL;
    this.apiKey = EVOLUTION_API_KEY;
    this.instance = WHATSAPP_INSTANCE;
  }

  isEnabled(): boolean {
    return Boolean(this.apiUrl && this.apiKey);
  }

  async sendMessage(phoneNumber: string, content: string): Promise<ChannelResponse> {
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

      const data = await response.json() as { key?: { id?: string } };
      
      logger.info('WhatsApp message sent', { phoneNumber, messageId: data.key?.id });

      return {
        success: true,
        messageId: data.key?.id,
        channel: 'whatsapp',
      };
    } catch (error) {
      logger.error('WhatsApp send failed', error as Error);
      return {
        success: false,
        channel: 'whatsapp',
        error: (error as Error).message,
      };
    }
  }

  async sendMediaMessage(
    phoneNumber: string,
    mediaUrl: string,
    caption?: string
  ): Promise<ChannelResponse> {
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

      const data = await response.json() as { key?: { id?: string } };

      return {
        success: true,
        messageId: data.key?.id,
        channel: 'whatsapp',
      };
    } catch (error) {
      logger.error('WhatsApp media send failed', error as Error);
      return {
        success: false,
        channel: 'whatsapp',
        error: (error as Error).message,
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      const response = await fetch(`${this.apiUrl}/instance/connectionState/${this.instance}`, {
        headers: { 'apikey': this.apiKey },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getInstanceStatus(): Promise<{ connected: boolean; name: string }> {
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

      const data = await response.json() as { instance?: { connectionStatus?: string } };
      return {
        connected: data.instance?.connectionStatus === 'open',
        name: this.instance,
      };
    } catch {
      return { connected: false, name: this.instance };
    }
  }
}

export const whatsappProvider = new WhatsAppProvider();
import crypto from 'crypto';

export function normalizeDedupContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function generateMessageDedupHash(
  conversationId: number,
  messageId: number,
  content: string
): string {
  return crypto
    .createHash('sha256')
    .update(`${conversationId}-${messageId}-${content}`)
    .digest('hex');
}

export function generateContentDedupHash(
  conversationId: string,
  contactId: string,
  content: string
): string {
  return crypto
    .createHash('sha256')
    .update(`${conversationId}-${contactId}-${normalizeDedupContent(content)}`)
    .digest('hex');
}

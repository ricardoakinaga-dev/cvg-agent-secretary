import { sanitizeForPrompt } from '../security/guardrails';

/**
 * Sanitizes every untrusted conversation fragment before it is composed into
 * an AI prompt. Keeping this boundary explicit prevents callers from
 * accidentally sanitizing only the current message.
 */
export function sanitizePromptHistory(history: string[]): string[] {
  return history.map(message => sanitizeForPrompt(message));
}

export function sanitizePromptMemories(memories: string[]): string[] {
  return memories.map(memory => sanitizeForPrompt(memory));
}

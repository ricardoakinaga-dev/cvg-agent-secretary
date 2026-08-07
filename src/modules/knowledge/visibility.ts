const INTERNAL_KNOWLEDGE_TAGS = new Set([
  'confidencial',
  'confidential',
  'internal',
  'interno',
  'restricted',
  'restrito',
  'staff-only',
]);

function normalizeTag(tag: string): string {
  return tag
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export const INTERNAL_KNOWLEDGE_TAG_VALUES = [...INTERNAL_KNOWLEDGE_TAGS];

/**
 * Chatwoot contacts are not authenticated as hospital staff. A declared role
 * is useful for routing, never for authorizing confidential knowledge.
 */
export function isPublicConversationKnowledge(tags: string[]): boolean {
  return !tags.some(tag => INTERNAL_KNOWLEDGE_TAGS.has(normalizeTag(tag)));
}

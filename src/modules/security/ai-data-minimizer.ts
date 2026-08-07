import { maskSensitiveData } from '../../shared/data-masking';
import type { ContactRole } from '../../shared/types';

const MAX_CURRENT_MESSAGE_CHARS = 2_000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_MESSAGE_CHARS = 1_000;
const MAX_KNOWLEDGE_CHUNKS = 3;
const MAX_KNOWLEDGE_CONTENT_CHARS = 2_000;
const MAX_KNOWLEDGE_TITLE_CHARS = 120;
const MAX_TOOL_RESULT_CHARS = 4_000;

interface ProviderInputContext {
  conversationId?: string;
  contactId?: string;
  contactName: string;
  conversationHistory: string[];
  memories: string[];
  pets?: Array<{
    id: string;
    name: string;
    species: string;
    breed: string | null;
  }>;
  knowledge: Array<{
    id: string;
    content: string;
    source: string;
    relevance: number;
    category?: string;
    title?: string;
  }>;
  schedulingState?: unknown;
  contactIntake?: {
    contactRole: ContactRole;
    contactReason: string;
  };
}

export interface MinimizedProviderContext {
  contactName: '[TUTOR]';
  conversationHistory: string[];
  memories: [];
  pets: Array<{
    name: string;
    species: string;
  }>;
  knowledge: Array<{
    content: string;
    title?: string;
  }>;
  schedulingState?: {
    stage: string;
  };
  contactIntake?: {
    contactRole: ContactRole;
    contactReason: string;
  };
}

export interface MinimizedProviderInput {
  message: string;
  context: MinimizedProviderContext;
}

interface Alias {
  source: string;
  replacement: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasesForName(name: string, replacement: string): Alias[] {
  const variants = new Set([name.trim()]);
  for (const part of name.trim().split(/\s+/)) {
    if (part.length >= 3) {
      variants.add(part);
    }
  }

  return [...variants]
    .filter(Boolean)
    .map(source => ({ source, replacement }));
}

function buildAliases(context: ProviderInputContext): Alias[] {
  const aliases = aliasesForName(context.contactName, '[TUTOR]');
  if (context.conversationId) {
    aliases.push({ source: context.conversationId, replacement: '[INTERNAL_ID]' });
  }
  if (context.contactId) {
    aliases.push({ source: context.contactId, replacement: '[INTERNAL_ID]' });
  }
  for (const [index, pet] of (context.pets || []).entries()) {
    aliases.push(...aliasesForName(pet.name, `[PET_${index + 1}]`));
    if (pet.id) {
      aliases.push({ source: pet.id, replacement: '[PET_ID]' });
    }
    if (pet.breed) {
      aliases.push(...aliasesForName(pet.breed, '[PET_BREED]'));
    }
  }

  return aliases.sort((left, right) => right.source.length - left.source.length);
}

export function minimizeProviderToolResult(
  context: ProviderInputContext,
  result: unknown
): string {
  const serialized = JSON.stringify(result) ?? 'null';
  const sanitized = sanitizeAndBound(serialized, buildAliases(context), serialized.length);
  if (sanitized.length <= MAX_TOOL_RESULT_CHARS) {
    return sanitized;
  }

  return JSON.stringify({
    truncated: true,
    summary: sanitized.slice(0, MAX_TOOL_RESULT_CHARS - 100),
  });
}

function replaceKnownNames(text: string, aliases: Alias[]): string {
  let result = text;
  for (const alias of aliases) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(alias.source)}(?![\\p{L}\\p{N}])`,
      'giu'
    );
    result = result.replace(pattern, alias.replacement);
  }
  return result;
}

function redactDirectIdentifiers(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF]')
    .replace(/\b\d{11}\b/g, '[CPF]')
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ]')
    .replace(/\b\d{14}\b/g, '[CNPJ]')
    .replace(/\b(?:\d{4}[\s-]){3}\d{4}\b/g, '[PAYMENT_CARD]')
    .replace(/\+55\s*\(?\d{2}\)?(?:[\s-]*\d){8,9}\b/g, '[PHONE]')
    .replace(/\(\d{2}\)\s*\d{4,5}[\s-]*\d{4}\b/g, '[PHONE]');
}

function sanitizeAndBound(text: string, aliases: Alias[], maxChars: number): string {
  const pseudonymized = replaceKnownNames(text, aliases);
  const redacted = redactDirectIdentifiers(pseudonymized);
  return maskSensitiveData(redacted).slice(0, maxChars);
}

function minimizeSchedulingState(value: unknown): { stage: string } | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const stage = (value as Record<string, unknown>).stage;
  if (typeof stage !== 'string' || stage.length === 0) {
    return undefined;
  }

  return { stage: stage.slice(0, 64) };
}

/**
 * Builds the only context allowed to cross an AI provider boundary.
 * Trusted identifiers remain in the caller-owned context for server-side tool
 * authorization, while provider-visible personalization is pseudonymous.
 */
export function minimizeProviderInput(
  context: ProviderInputContext,
  message: string
): MinimizedProviderInput {
  const aliases = buildAliases(context);
  const history = context.conversationHistory.slice(-MAX_HISTORY_MESSAGES);
  const pets = (context.pets || []).map((pet, index) => ({
    name: `[PET_${index + 1}]`,
    species: sanitizeAndBound(pet.species, aliases, 80),
  }));
  const knowledge = context.knowledge.slice(0, MAX_KNOWLEDGE_CHUNKS).map(chunk => ({
    content: sanitizeAndBound(chunk.content, aliases, MAX_KNOWLEDGE_CONTENT_CHARS),
    ...(chunk.title
      ? { title: sanitizeAndBound(chunk.title, aliases, MAX_KNOWLEDGE_TITLE_CHARS) }
      : {}),
  }));
  const schedulingState = minimizeSchedulingState(context.schedulingState);
  const contactIntake = context.contactIntake
    ? {
        contactRole: context.contactIntake.contactRole,
        contactReason: sanitizeAndBound(
          context.contactIntake.contactReason,
          aliases,
          500
        ),
      }
    : undefined;

  return {
    message: sanitizeAndBound(message, aliases, MAX_CURRENT_MESSAGE_CHARS),
    context: {
      contactName: '[TUTOR]',
      conversationHistory: history.map(item => (
        sanitizeAndBound(item, aliases, MAX_HISTORY_MESSAGE_CHARS)
      )),
      // Free-form memory has no provenance or field-level sensitivity metadata.
      // Exclude it until an allow-listed structured memory contract exists.
      memories: [],
      pets,
      knowledge,
      ...(schedulingState ? { schedulingState } : {}),
      ...(contactIntake ? { contactIntake } : {}),
    },
  };
}

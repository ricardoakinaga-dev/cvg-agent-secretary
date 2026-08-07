// Data Masking Utility - Phase 5A Enterprise
// Masks sensitive data for logs and displays

/**
 * Mask CPF: 123.456.789-01 → ***.456.789-**
 */
export function maskCPF(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return cpf;
  return `***.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-**`;
}

/**
 * Mask CNPJ: 12.345.678/0001-90 → **.345.678/0001-**
 */
export function maskCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return cnpj;
  return `**.${cleaned.slice(2, 5)}.${cleaned.slice(5, 8)}/${cleaned.slice(8, 12)}-**`;
}

/**
 * Mask phone: +5511999998888 → +55**98888
 */
export function maskPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 8) return phone;
  const lastFour = cleaned.slice(-4);
  const countryCode = cleaned.length > 11 ? cleaned.slice(0, 2) : '';
  return countryCode ? `+${countryCode}**${lastFour}` : `****${lastFour}`;
}

/**
 * Mask email: joão@example.com → j***@example.com
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const maskedLocal = local.length > 1 
    ? `${local[0]}${'*'.repeat(Math.min(local.length - 1, 3))}` 
    : '*';
  return `${maskedLocal}@${domain}`;
}

/**
 * Mask name: João Silva → J. Silva
 */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '***';
  if (parts.length === 1) return `${parts[0][0]}.`;
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

/**
 * Auto-detect and mask sensitive data in text
 */
export function maskSensitiveData(text: string): string {
  let masked = text;

  // Mask formatted Brazilian phone numbers with or without country code.
  masked = masked.replace(
    /\+55\s*\(?\d{2}\)?(?:[\s-]*\d){8,9}\b/g,
    (match) => maskPhone(match)
  );
  masked = masked.replace(
    /\(\d{2}\)\s*\d{4,5}[\s-]*\d{4}\b/g,
    (match) => maskPhone(match)
  );

  // Mask common formatted and unformatted 16-digit payment card numbers.
  masked = masked.replace(/\b(?:\d{4}[\s-]){3}\d{4}\b/g, '**** **** **** ****');
  masked = masked.replace(/\b\d{16}\b/g, '**** **** **** ****');

  // Mask CPF (format: XXX.XXX.XXX-XX or 11 digits)
  masked = masked.replace(
    /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
    (match) => maskCPF(match)
  );
  masked = masked.replace(
    /\b\d{11}\b/g,
    (match) => maskCPF(match)
  );

  // Mask CNPJ (format: XX.XXX.XXX/XXXX-XX or 14 digits)
  masked = masked.replace(
    /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,
    (match) => maskCNPJ(match)
  );
  masked = masked.replace(
    /\b\d{14}\b/g,
    (match) => maskCNPJ(match)
  );

  // Mask email
  masked = masked.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    (match) => maskEmail(match)
  );

  return masked;
}

/**
 * Mask object fields that might contain sensitive data
 */
export function maskObjectForLog(obj: Record<string, unknown>): Record<string, unknown> {
  return maskLogRecord(obj, new WeakSet<object>(), 0);
}

const REDACTED_LOG_VALUE = '[REDACTED]';
const MAX_LOG_DEPTH = 6;
const MAX_LOG_ARRAY_ITEMS = 25;
const CONTENT_FIELD_PATTERN = /(^|_)(input|output|payload|body|content|message|query|response|prompt|notes?|summary|description|address|stack|raw)(_|$)/i;

function maskLogRecord(
  obj: Record<string, unknown>,
  seen: WeakSet<object>,
  depth: number
): Record<string, unknown> {
  if (seen.has(obj)) {
    return { circular: '[CIRCULAR]' };
  }
  if (depth >= MAX_LOG_DEPTH) {
    return { truncated: '[MAX_DEPTH]' };
  }

  seen.add(obj);
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    masked[key] = maskLogValue(key, value, seen, depth + 1);
  }
  seen.delete(obj);
  return masked;
}

function maskLogValue(
  key: string,
  value: unknown,
  seen: WeakSet<object>,
  depth: number
): unknown {
  const lowerKey = key.toLowerCase();
  if (CONTENT_FIELD_PATTERN.test(lowerKey)) {
    return REDACTED_LOG_VALUE;
  }
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    if (lowerKey.includes('cpf')) return maskCPF(value);
    if (lowerKey.includes('cnpj')) return maskCNPJ(value);
    if (lowerKey.includes('phone') || lowerKey.includes('whatsapp')) return maskPhone(value);
    if (lowerKey.includes('email')) return maskEmail(value);
    if (lowerKey === 'name' || lowerKey.endsWith('name')) return maskName(value);
    if (lowerKey.includes('document') || lowerKey.includes('secret') || lowerKey.includes('token')) {
      return REDACTED_LOG_VALUE;
    }
    return maskSensitiveData(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_LOG_ARRAY_ITEMS).map((item) => (
      typeof item === 'object' && item !== null
        ? maskLogRecord(item as Record<string, unknown>, seen, depth)
        : maskLogValue('item', item, seen, depth)
    ));
  }
  if (typeof value === 'object') {
    return maskLogRecord(value as Record<string, unknown>, seen, depth);
  }
  return String(value);
}

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
  const countryCode = cleaned.length > 10 ? cleaned.slice(0, 2) : '';
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
  const sensitiveFields = ['cpf', 'cnpj', 'phone', 'email', 'document', 'ssn'];
  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const lowerKey = key.toLowerCase();
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        if (lowerKey.includes('cpf')) {
          masked[key] = maskCPF(value);
        } else if (lowerKey.includes('cnpj')) {
          masked[key] = maskCNPJ(value);
        } else if (lowerKey.includes('phone')) {
          masked[key] = maskPhone(value);
        } else if (lowerKey.includes('email')) {
          masked[key] = maskEmail(value);
        } else {
          masked[key] = maskSensitiveData(value);
        }
      } else {
        masked[key] = maskSensitiveData(value);
      }
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

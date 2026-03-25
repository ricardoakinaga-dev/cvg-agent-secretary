/**
 * Mask CPF: 123.456.789-01 → ***.456.789-**
 */
export declare function maskCPF(cpf: string): string;
/**
 * Mask CNPJ: 12.345.678/0001-90 → **.345.678/0001-**
 */
export declare function maskCNPJ(cnpj: string): string;
/**
 * Mask phone: +5511999998888 → +55**98888
 */
export declare function maskPhone(phone: string): string;
/**
 * Mask email: joão@example.com → j***@example.com
 */
export declare function maskEmail(email: string): string;
/**
 * Mask name: João Silva → J. Silva
 */
export declare function maskName(name: string): string;
/**
 * Auto-detect and mask sensitive data in text
 */
export declare function maskSensitiveData(text: string): string;
/**
 * Mask object fields that might contain sensitive data
 */
export declare function maskObjectForLog(obj: Record<string, unknown>): Record<string, unknown>;
//# sourceMappingURL=data-masking.d.ts.map
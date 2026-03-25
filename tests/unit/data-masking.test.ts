// Tests for Data Masking Utility - Phase 5A Enterprise

import {
  maskCPF,
  maskCNPJ,
  maskPhone,
  maskEmail,
  maskName,
  maskSensitiveData,
  maskObjectForLog,
} from '../../src/shared/data-masking';

describe('Data Masking', () => {
  describe('maskCPF', () => {
    it('should mask CPF with dots and dash', () => {
      expect(maskCPF('123.456.789-01')).toBe('***.456.789-**');
    });

    it('should mask CPF without formatting', () => {
      expect(maskCPF('12345678901')).toBe('***.456.789-**');
    });

    it('should return original if not 11 digits', () => {
      expect(maskCPF('12345')).toBe('12345');
    });
  });

  describe('maskCNPJ', () => {
    it('should mask CNPJ with formatting', () => {
      expect(maskCNPJ('12.345.678/0001-90')).toBe('**.345.678/0001-**');
    });

    it('should mask CNPJ without formatting', () => {
      expect(maskCNPJ('12345678000190')).toBe('**.345.678/0001-**');
    });
  });

  describe('maskPhone', () => {
    it('should mask phone with country code', () => {
      expect(maskPhone('+5511999998888')).toBe('+55**8888');
    });

    it('should mask local phone', () => {
      expect(maskPhone('999998888')).toBe('****8888');
    });
  });

  describe('maskEmail', () => {
    it('should mask email local part', () => {
      expect(maskEmail('joão@example.com')).toBe('j***@example.com');
    });

    it('should handle short local part', () => {
      expect(maskEmail('a@b.com')).toBe('*@b.com');
    });
  });

  describe('maskName', () => {
    it('should mask full name', () => {
      expect(maskName('João Silva')).toBe('J. Silva');
    });

    it('should handle single name', () => {
      expect(maskName('João')).toBe('J.');
    });
  });

  describe('maskSensitiveData', () => {
    it('should mask CPF in text', () => {
      const text = 'Cliente CPF: 123.456.789-01';
      expect(maskSensitiveData(text)).toContain('***.456.789-**');
    });

    it('should mask email in text', () => {
      const text = 'Email: test@example.com';
      expect(maskSensitiveData(text)).toContain('t***@example.com');
    });

    it('should mask multiple sensitive data', () => {
      const text = 'CPF: 123.456.789-01, Email: a@b.com';
      const masked = maskSensitiveData(text);
      expect(masked).toContain('***.456.789-**');
    });
  });

  describe('maskObjectForLog', () => {
    it('should mask cpf field', () => {
      const obj = { cpf: '123.456.789-01', name: 'João' };
      const masked = maskObjectForLog(obj);
      expect(masked.cpf).toBe('***.456.789-**');
    });

    it('should mask phone field', () => {
      const obj = { phone: '+5511999998888', name: 'João' };
      const masked = maskObjectForLog(obj);
      expect(masked.phone).toBe('+55**8888');
    });

    it('should mask email field', () => {
      const obj = { email: 'test@example.com', name: 'João' };
      const masked = maskObjectForLog(obj);
      expect(masked.email).toBe('t***@example.com');
    });

    it('should not mask non-sensitive fields', () => {
      const obj = { name: 'João', age: 30 };
      const masked = maskObjectForLog(obj);
      expect(masked.name).toBe('João');
      expect(masked.age).toBe(30);
    });
  });
});

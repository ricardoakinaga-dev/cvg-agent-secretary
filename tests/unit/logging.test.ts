// Tests for Logging Module - Phase 5A Enterprise

import { logger } from '../../src/modules/logging/index';

describe('Logging Module', () => {
  describe('logger instance', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });

    it('should have child method', () => {
      expect(typeof logger.child).toBe('function');
    });
  });

  describe('child logger', () => {
    it('should create child logger with context', () => {
      const childLogger = logger.child({ correlationId: 'test-123' });
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });

    it('should support multiple context values', () => {
      const childLogger = logger.child({ 
        correlationId: 'test-123',
        conversationId: 'conv-456'
      });
      expect(childLogger).toBeDefined();
    });
  });

  describe('logging methods', () => {
    it('should log info messages without throwing', () => {
      expect(() => logger.info('Test info message')).not.toThrow();
    });

    it('should log info with metadata', () => {
      expect(() => logger.info('Test info', { key: 'value' })).not.toThrow();
    });

    it('should log error messages', () => {
      const error = new Error('Test error');
      expect(() => logger.error('Error occurred', error)).not.toThrow();
    });

    it('should log error with metadata', () => {
      const error = new Error('Test error');
      expect(() => logger.error('Error occurred', error, { context: 'test' })).not.toThrow();
    });

    it('should log warn messages', () => {
      expect(() => logger.warn('Warning message')).not.toThrow();
    });

    it('should log debug messages', () => {
      expect(() => logger.debug('Debug message')).not.toThrow();
    });
  });
});

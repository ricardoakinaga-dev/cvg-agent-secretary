import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { logger } from '../modules/logging';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
  keyGenerator: (req) => {
    return (req.headers['x-correlation-id'] as string) || ipKeyGenerator(req.ip || 'unknown');
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { 
      ip: req.ip, 
      path: req.path,
      correlationId: req.headers['x-correlation-id'] as string
    });
    res.status(429).json({ 
      success: false, 
      error: 'Too many requests, please try again later' 
    });
  },
});

export const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Webhook rate limit exceeded' },
  keyGenerator: (req) => {
    return (req.headers['x-chatwoot-account-id'] as string) || ipKeyGenerator(req.ip || 'unknown');
  },
  handler: (req, res) => {
    logger.warn('Webhook rate limit exceeded', { 
      ip: req.ip, 
      path: req.path 
    });
    res.status(429).json({ 
      success: false, 
      error: 'Webhook rate limit exceeded' 
    });
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts' },
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', { ip: req.ip });
    res.status(429).json({ 
      success: false, 
      error: 'Too many authentication attempts, please try again later' 
    });
  },
});

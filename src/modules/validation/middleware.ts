import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../logging';

export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      const errors = result.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      
      logger.warn('Validation failed', { path: req.path, errors });
      
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }
    
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    
    if (!result.success) {
      const errors = result.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      
      logger.warn('Query validation failed', { path: req.path, errors });
      
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: errors,
      });
    }
    
    req.query = result.data;
    next();
  };
}

export function validateParams(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    
    if (!result.success) {
      const errors = result.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      
      logger.warn('Params validation failed', { path: req.path, errors });
      
      return res.status(400).json({
        success: false,
        error: 'Invalid URL parameters',
        details: errors,
      });
    }
    
    req.params = result.data;
    next();
  };
}

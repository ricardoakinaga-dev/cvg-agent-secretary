import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateApi, requirePermission } from '../../middleware/auth';
import { metrics } from '../../shared/metrics';
import { logger } from '../logging';
import { observabilityCollector } from './collector';

const metricsLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many metrics requests' },
});

export const observabilityRouter = Router();

// This route is mounted before the general distributed API limiter. A single
// Prometheus server scrapes every pod from one source IP, so applying a shared
// IP quota across replicas would incorrectly throttle healthy pod-level scrapes.
observabilityRouter.get(
  '/',
  metricsLimiter,
  authenticateApi,
  requirePermission('analytics:read'),
  async (req, res) => {
    try {
      await observabilityCollector.collect();
      if (req.query.format === 'prometheus' || req.accepts(['json', 'text']) === 'text') {
        res.type('text/plain; version=0.0.4').send(metrics.toPrometheus());
        return;
      }
      res.json(metrics.getAllMetrics());
    } catch (error) {
      logger.error('Metrics error', error as Error);
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  }
);

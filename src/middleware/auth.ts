import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { hasPermission, isValidRole, Permission, Role, UserContext } from '../modules/auth/rbac';
import { logger } from '../modules/logging';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserContext;
    }
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;
  return token;
}

function getRequestToken(req: Request): string | undefined {
  const headerToken = req.header('x-api-key');
  return headerToken || extractBearerToken(req.header('authorization'));
}

function safeTokenEquals(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function getRequestRole(req: Request): Role {
  const roleHeader = req.header('x-user-role') || 'admin';
  return isValidRole(roleHeader) ? roleHeader : 'viewer';
}

export function authenticateApi(req: Request, res: Response, next: NextFunction): void {
  if (!config.auth.apiToken) {
    logger.error('API auth token is not configured');
    res.status(503).json({ success: false, error: 'API authentication is not configured' });
    return;
  }

  const token = getRequestToken(req);
  if (!token || !safeTokenEquals(config.auth.apiToken, token)) {
    logger.warn('API authentication failed', {
      path: req.path,
      hasToken: Boolean(token),
    });
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  req.user = {
    id: req.header('x-user-id') || 'api-client',
    role: getRequestRole(req),
    email: req.header('x-user-email'),
  };

  next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;

    if (!role || !hasPermission(role, permission)) {
      logger.warn('API authorization failed', {
        path: req.path,
        role,
        permission,
      });
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    next();
  };
}

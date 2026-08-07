import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { hasPermission, Permission, UserContext } from '../modules/auth/rbac';
import { verifyIdentityToken } from '../modules/auth/token-verifier';
import { logger } from '../modules/logging';

const LEGACY_API_SERVICE_PRINCIPAL: Readonly<UserContext> = {
  id: 'legacy-api-service',
  role: 'manager',
};

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

function safeTokenEquals(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function authenticateApi(req: Request, res: Response, next: NextFunction): void {
  const bearerToken = extractBearerToken(req.header('authorization'));
  const signedIdentityConfigured = Boolean(
    config.auth.jwtPublicKey && config.auth.jwtIssuer && config.auth.jwtAudience
  );
  const legacyAuthEnabled = !config.isProduction
    && config.auth.allowLegacyApiToken
    && Boolean(config.auth.apiToken);

  if (!signedIdentityConfigured && !legacyAuthEnabled) {
    logger.error('API authentication is not configured');
    res.status(503).json({ success: false, error: 'API authentication is not configured' });
    return;
  }

  if (bearerToken && signedIdentityConfigured) {
    try {
      req.user = verifyIdentityToken(bearerToken, {
        publicKey: config.auth.jwtPublicKey,
        issuer: config.auth.jwtIssuer,
        audience: config.auth.jwtAudience,
      });
      next();
      return;
    } catch {
      // The explicitly enabled non-production legacy fallback is checked below.
    }
  }

  const legacyToken = req.header('x-api-key') || bearerToken;
  if (legacyAuthEnabled
    && legacyToken
    && safeTokenEquals(config.auth.apiToken, legacyToken)) {
    req.user = { ...LEGACY_API_SERVICE_PRINCIPAL };
    next();
    return;
  }

  logger.warn('API authentication failed', {
    path: req.path,
    hasToken: Boolean(legacyToken),
  });
  res.status(401).json({ success: false, error: 'Unauthorized' });
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

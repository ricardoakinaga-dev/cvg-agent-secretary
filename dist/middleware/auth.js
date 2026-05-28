"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateApi = authenticateApi;
exports.requirePermission = requirePermission;
const crypto_1 = require("crypto");
const config_1 = require("../config");
const rbac_1 = require("../modules/auth/rbac");
const logging_1 = require("../modules/logging");
function extractBearerToken(header) {
    if (!header)
        return undefined;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token)
        return undefined;
    return token;
}
function getRequestToken(req) {
    const headerToken = req.header('x-api-key');
    return headerToken || extractBearerToken(req.header('authorization'));
}
function safeTokenEquals(expected, actual) {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    if (expectedBuffer.length !== actualBuffer.length) {
        return false;
    }
    return (0, crypto_1.timingSafeEqual)(expectedBuffer, actualBuffer);
}
function getRequestRole(req) {
    const roleHeader = req.header('x-user-role') || 'admin';
    return (0, rbac_1.isValidRole)(roleHeader) ? roleHeader : 'viewer';
}
function authenticateApi(req, res, next) {
    if (!config_1.config.auth.apiToken) {
        logging_1.logger.error('API auth token is not configured');
        res.status(503).json({ success: false, error: 'API authentication is not configured' });
        return;
    }
    const token = getRequestToken(req);
    if (!token || !safeTokenEquals(config_1.config.auth.apiToken, token)) {
        logging_1.logger.warn('API authentication failed', {
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
function requirePermission(permission) {
    return (req, res, next) => {
        const role = req.user?.role;
        if (!role || !(0, rbac_1.hasPermission)(role, permission)) {
            logging_1.logger.warn('API authorization failed', {
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
//# sourceMappingURL=auth.js.map
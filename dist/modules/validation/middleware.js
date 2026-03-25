"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBody = validateBody;
exports.validateQuery = validateQuery;
exports.validateParams = validateParams;
const logging_1 = require("../logging");
function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const errors = result.error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            logging_1.logger.warn('Validation failed', { path: req.path, errors });
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
function validateQuery(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            const errors = result.error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            logging_1.logger.warn('Query validation failed', { path: req.path, errors });
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
function validateParams(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.params);
        if (!result.success) {
            const errors = result.error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            logging_1.logger.warn('Params validation failed', { path: req.path, errors });
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
//# sourceMappingURL=middleware.js.map
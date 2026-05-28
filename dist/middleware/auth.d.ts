import { Request, Response, NextFunction } from 'express';
import { Permission, UserContext } from '../modules/auth/rbac';
declare global {
    namespace Express {
        interface Request {
            user?: UserContext;
        }
    }
}
export declare function authenticateApi(req: Request, res: Response, next: NextFunction): void;
export declare function requirePermission(permission: Permission): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map
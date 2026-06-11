import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            rawBody?: Buffer;
        }
    }
}
export declare function computeChatwootSignature(rawBody: Buffer, secret: string, timestamp?: string): string;
export declare function verifyChatwootSignature(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=chatwoot-signature.d.ts.map
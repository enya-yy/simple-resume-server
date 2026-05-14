import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestIdMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.requestId = randomUUID();
  next();
}

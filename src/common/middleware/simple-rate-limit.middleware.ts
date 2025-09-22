import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

@Injectable()
export class SimpleRateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SimpleRateLimitMiddleware.name);

  // Basic rate limiting - 100 requests per 15 minutes per IP
  private limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests',
      message: 'Please try again later',
      statusCode: 429
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.limiter(req, res, next);
  }
}
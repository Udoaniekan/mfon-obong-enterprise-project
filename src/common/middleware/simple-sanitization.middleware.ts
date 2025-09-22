import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InputSanitizationService } from '../services/simple-sanitization.service';

@Injectable()
export class SimpleSanitizationMiddleware implements NestMiddleware {
  constructor(private readonly sanitizationService: InputSanitizationService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = this.sanitizationService.sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = this.sanitizationService.sanitizeObject(req.query);
    }

    next();
  }
}
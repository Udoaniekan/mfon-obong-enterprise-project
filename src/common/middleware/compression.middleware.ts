import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as compression from 'compression';

@Injectable()
export class CompressionMiddleware implements NestMiddleware {
  private compressionHandler = compression({
    // Only compress responses larger than 1KB
    threshold: 1024,
    
    // Compression level (1-9, 6 is default)
    level: 6,
    
    // Only compress these content types
    filter: (req: Request, res: Response) => {
      // Don't compress if client doesn't support it
      if (!req.headers['accept-encoding']) {
        return false;
      }

      // Don't compress images, videos, or already compressed files
      const contentType = res.getHeader('content-type') as string;
      if (contentType) {
        const skipTypes = [
          'image/',
          'video/',
          'audio/',
          'application/zip',
          'application/gzip',
          'application/compress'
        ];
        
        if (skipTypes.some(type => contentType.startsWith(type))) {
          return false;
        }
      }

      // Compress text-based content
      return compression.filter(req, res);
    }
  });

  use(req: Request, res: Response, next: NextFunction) {
    this.compressionHandler(req, res, next);
  }
}
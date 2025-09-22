import { Injectable } from '@nestjs/common';
import { Transform } from 'class-transformer';

@Injectable()
export class InputSanitizationService {
  /**
   * Simple string sanitization - remove dangerous characters
   */
  sanitizeString(input: string): string {
    if (typeof input !== 'string') return '';
    
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove < and >
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers like onclick=
      .substring(0, 1000); // Limit length
  }

  /**
   * Sanitize object recursively
   */
  sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize key and value
        const cleanKey = this.sanitizeString(key);
        sanitized[cleanKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  }
}

// Simple transform decorator for DTOs
export function Sanitize() {
  return Transform(({ value }) => {
    const service = new InputSanitizationService();
    return service.sanitizeString(value);
  });
}
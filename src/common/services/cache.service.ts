import { Injectable, Logger } from '@nestjs/common';

interface CacheItem {
  data: any;
  expiry: number;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private cache = new Map<string, CacheItem>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes default

  /**
   * Set a value in cache with TTL (time to live)
   */
  set(key: string, value: any, ttlMs?: number): void {
    const ttl = ttlMs || this.defaultTTL;
    const expiry = Date.now() + ttl;
    
    this.cache.set(key, {
      data: value,
      expiry
    });

    this.logger.debug(`Cache SET: ${key} (TTL: ${ttl}ms)`);
  }

  /**
   * Get a value from cache
   */
  get<T = any>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      this.logger.debug(`Cache MISS: ${key}`);
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.logger.debug(`Cache EXPIRED: ${key}`);
      return null;
    }

    this.logger.debug(`Cache HIT: ${key}`);
    return item.data;
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.logger.debug(`Cache DELETE: ${key}`);
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.logger.debug('Cache CLEARED');
  }

  /**
   * Delete expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let deletedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      this.logger.debug(`Cache CLEANUP: Removed ${deletedCount} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let expired = 0;
    let active = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.cache.size,
      active,
      expired
    };
  }

  /**
   * Get or set pattern - useful for caching expensive operations
   */
  async getOrSet<T>(
    key: string, 
    factory: () => Promise<T>, 
    ttlMs?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Not in cache, execute factory function
    const result = await factory();
    
    // Store in cache
    this.set(key, result, ttlMs);
    
    return result;
  }

  /**
   * Generate cache key for common patterns
   */
  generateKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}:${parts.join(':')}`;
  }
}

// Decorator for caching method results
export function Cacheable(ttlMs?: number) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheService = this.cacheService as CacheService;
      
      if (!cacheService) {
        // If no cache service, just execute normally
        return method.apply(this, args);
      }

      // Generate cache key from method name and arguments
      const cacheKey = cacheService.generateKey(
        `${target.constructor.name}.${propertyName}`,
        ...args.map(arg => JSON.stringify(arg))
      );

      // Try to get from cache
      const cached = cacheService.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Execute method and cache result
      const result = await method.apply(this, args);
      cacheService.set(cacheKey, result, ttlMs);
      
      return result;
    };
  };
}
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redisClient: Redis;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    try {
      this.redisClient = new Redis({
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        password: this.configService.get('REDIS_PASSWORD'),
        db: this.configService.get('REDIS_DB', 0),
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        // Connection timeout
        connectTimeout: 10000,
        commandTimeout: 5000,
      });

      // Connect to Redis
      await this.redisClient.connect();
      
      this.logger.log('Successfully connected to Redis');

      // Listen for Redis events
      this.redisClient.on('error', (error) => {
        this.logger.error('Redis connection error:', error);
      });

      this.redisClient.on('connect', () => {
        this.logger.log('Redis connected');
      });

      this.redisClient.on('ready', () => {
        this.logger.log('Redis ready');
      });

      this.redisClient.on('close', () => {
        this.logger.warn('Redis connection closed');
      });

    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      // In development, continue without Redis
      if (this.configService.get('NODE_ENV') === 'development') {
        this.logger.warn('Continuing without Redis in development mode');
      } else {
        throw error;
      }
    }
  }

  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.logger.log('Redis connection closed');
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.redisClient && this.redisClient.status === 'ready';
  }

  /**
   * Blacklist a JWT token
   */
  async blacklistToken(token: string, expirationTime: number): Promise<void> {
    if (!this.isAvailable()) {
      this.logger.warn('Redis not available, cannot blacklist token');
      return;
    }

    try {
      const key = `blacklist:${token}`;
      const ttl = Math.max(1, Math.floor(expirationTime - Date.now() / 1000));
      
      await this.redisClient.setex(key, ttl, '1');
      this.logger.debug(`Token blacklisted with TTL: ${ttl} seconds`);
    } catch (error) {
      this.logger.error('Failed to blacklist token:', error);
      throw error;
    }
  }

  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    if (!this.isAvailable()) {
      this.logger.warn('Redis not available, assuming token is not blacklisted');
      return false;
    }

    try {
      const key = `blacklist:${token}`;
      const result = await this.redisClient.get(key);
      return result !== null;
    } catch (error) {
      this.logger.error('Failed to check token blacklist:', error);
      // In case of Redis error, assume token is not blacklisted to avoid blocking users
      return false;
    }
  }

  /**
   * Store device fingerprint for session tracking
   */
  async storeDeviceSession(
    userId: string, 
    deviceFingerprint: string, 
    sessionData: any,
    ttl: number = 86400 // 24 hours
  ): Promise<void> {
    if (!this.isAvailable()) {
      this.logger.warn('Redis not available, cannot store device session');
      return;
    }

    try {
      const key = `session:${userId}:${deviceFingerprint}`;
      await this.redisClient.setex(key, ttl, JSON.stringify(sessionData));
      this.logger.debug(`Device session stored for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to store device session:', error);
      throw error;
    }
  }

  /**
   * Get device session
   */
  async getDeviceSession(userId: string, deviceFingerprint: string): Promise<any | null> {
    if (!this.isAvailable()) {
      this.logger.warn('Redis not available, cannot get device session');
      return null;
    }

    try {
      const key = `session:${userId}:${deviceFingerprint}`;
      const result = await this.redisClient.get(key);
      return result ? JSON.parse(result) : null;
    } catch (error) {
      this.logger.error('Failed to get device session:', error);
      return null;
    }
  }

  /**
   * Remove device session
   */
  async removeDeviceSession(userId: string, deviceFingerprint: string): Promise<void> {
    if (!this.isAvailable()) {
      this.logger.warn('Redis not available, cannot remove device session');
      return;
    }

    try {
      const key = `session:${userId}:${deviceFingerprint}`;
      await this.redisClient.del(key);
      this.logger.debug(`Device session removed for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to remove device session:', error);
      throw error;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<string[]> {
    if (!this.isAvailable()) {
      this.logger.warn('Redis not available, cannot get user sessions');
      return [];
    }

    try {
      const pattern = `session:${userId}:*`;
      const keys = await this.redisClient.keys(pattern);
      return keys.map(key => key.split(':')[2]); // Extract device fingerprints
    } catch (error) {
      this.logger.error('Failed to get user sessions:', error);
      return [];
    }
  }

  /**
   * Track suspicious activity
   */
  async trackSuspiciousActivity(
    identifier: string, 
    activity: string, 
    ttl: number = 3600 // 1 hour
  ): Promise<number> {
    if (!this.isAvailable()) {
      this.logger.warn('Redis not available, cannot track suspicious activity');
      return 0;
    }

    try {
      const key = `suspicious:${identifier}:${activity}`;
      const count = await this.redisClient.incr(key);
      
      if (count === 1) {
        await this.redisClient.expire(key, ttl);
      }
      
      return count;
    } catch (error) {
      this.logger.error('Failed to track suspicious activity:', error);
      return 0;
    }
  }

  /**
   * Store rate limiting data
   */
  async incrementRateLimit(
    key: string, 
    ttl: number = 60,
    increment: number = 1
  ): Promise<number> {
    if (!this.isAvailable()) {
      this.logger.warn('Redis not available, cannot increment rate limit');
      return 0;
    }

    try {
      const rateLimitKey = `rate_limit:${key}`;
      const count = await this.redisClient.incrby(rateLimitKey, increment);
      
      if (count === increment) {
        await this.redisClient.expire(rateLimitKey, ttl);
      }
      
      return count;
    } catch (error) {
      this.logger.error('Failed to increment rate limit:', error);
      return 0;
    }
  }

  /**
   * Clear rate limiting data
   */
  async clearRateLimit(key: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      const rateLimitKey = `rate_limit:${key}`;
      await this.redisClient.del(rateLimitKey);
    } catch (error) {
      this.logger.error('Failed to clear rate limit:', error);
    }
  }
}
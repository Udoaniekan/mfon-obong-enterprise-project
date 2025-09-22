import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import { DeviceFingerprintService, DeviceFingerprint } from './device-fingerprint.service';

export interface JwtPayload {
  sub: string; // User ID
  email: string;
  role: string;
  branch?: string;
  iat?: number;
  exp?: number;
  jti?: string; // JWT ID for tracking
  deviceFingerprint?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface TokenValidationResult {
  isValid: boolean;
  payload?: JwtPayload;
  isBlacklisted?: boolean;
  isExpired?: boolean;
  deviceMismatch?: boolean;
  suspiciousActivity?: string[];
}

@Injectable()
export class EnhancedJwtService {
  private readonly logger = new Logger(EnhancedJwtService.name);
  private readonly accessTokenTTL: number;
  private readonly refreshTokenTTL: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly deviceFingerprintService: DeviceFingerprintService,
  ) {
    this.accessTokenTTL = parseInt(this.configService.get('JWT_ACCESS_EXPIRATION', '900')); // 15 minutes
    this.refreshTokenTTL = parseInt(this.configService.get('JWT_REFRESH_EXPIRATION', '604800')); // 7 days
  }

  /**
   * Generate access and refresh token pair
   */
  async generateTokenPair(
    userId: string,
    email: string,
    role: string,
    deviceFingerprint: DeviceFingerprint,
    branch?: string
  ): Promise<TokenPair> {
    const jti = this.generateJTI();
    const now = Math.floor(Date.now() / 1000);

    const basePayload = {
      sub: userId,
      email,
      role,
      branch,
      deviceFingerprint: deviceFingerprint.fingerprint,
      jti,
    };

    // Generate access token
    const accessTokenPayload = {
      ...basePayload,
      type: 'access',
      iat: now,
      exp: now + this.accessTokenTTL,
    };

    // Generate refresh token  
    const refreshTokenPayload = {
      ...basePayload,
      type: 'refresh',
      iat: now,
      exp: now + this.refreshTokenTTL,
    };

    const accessToken = this.jwtService.sign(accessTokenPayload);
    const refreshToken = this.jwtService.sign(refreshTokenPayload);

    // Store session in Redis
    await this.redisService.storeDeviceSession(
      userId,
      deviceFingerprint.fingerprint,
      {
        email,
        role,
        branch,
        lastAccess: new Date(),
        userAgent: deviceFingerprint.userAgent,
        ip: deviceFingerprint.ip,
        jti,
      },
      this.refreshTokenTTL
    );

    this.logger.debug(`Token pair generated for user ${userId} with device ${deviceFingerprint.fingerprint.substring(0, 8)}...`);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenTTL,
      tokenType: 'Bearer',
    };
  }

  /**
   * Validate and verify a JWT token
   */
  async validateToken(
    token: string,
    deviceFingerprint: DeviceFingerprint,
    expectedType: 'access' | 'refresh' = 'access'
  ): Promise<TokenValidationResult> {
    try {
      // Check if token is blacklisted
      const isBlacklisted = await this.redisService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        this.logger.warn('Attempted use of blacklisted token');
        return { isValid: false, isBlacklisted: true };
      }

      // Verify token signature and decode
      const payload = this.jwtService.verify(token) as JwtPayload;

      // Check token type
      if ((payload as any).type !== expectedType) {
        this.logger.warn(`Token type mismatch: expected ${expectedType}, got ${(payload as any).type}`);
        return { isValid: false };
      }

      // Check if token is expired
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return { isValid: false, isExpired: true };
      }

      // Verify device fingerprint
      if (payload.deviceFingerprint !== deviceFingerprint.fingerprint) {
        this.logger.warn(`Device fingerprint mismatch for user ${payload.sub}`);
        
        // Check if the fingerprints are similar (could be browser update)
        const storedSession = await this.redisService.getDeviceSession(
          payload.sub,
          payload.deviceFingerprint
        );

        if (storedSession) {
          const storedDeviceInfo = {
            fingerprint: payload.deviceFingerprint,
            userAgent: storedSession.userAgent,
            ip: storedSession.ip,
          } as DeviceFingerprint;

          const areSimilar = this.deviceFingerprintService.areFingerprintsSimilar(
            deviceFingerprint,
            storedDeviceInfo
          );

          if (!areSimilar) {
            // Track suspicious activity
            await this.redisService.trackSuspiciousActivity(
              payload.sub,
              'device_mismatch',
              3600
            );

            return { 
              isValid: false, 
              deviceMismatch: true,
              suspiciousActivity: ['device_fingerprint_mismatch']
            };
          }
        }
      }

      // Check for suspicious patterns
      const suspiciousPatterns = this.deviceFingerprintService.detectSuspiciousPatterns(deviceFingerprint);
      if (suspiciousPatterns.length > 0) {
        this.logger.warn(`Suspicious patterns detected: ${suspiciousPatterns.join(', ')}`);
        
        // Track suspicious activity but don't block the request yet
        await this.redisService.trackSuspiciousActivity(
          payload.sub,
          'suspicious_patterns',
          3600
        );
      }

      // Update last access time
      if (expectedType === 'access') {
        await this.updateLastAccess(payload.sub, deviceFingerprint.fingerprint);
      }

      return {
        isValid: true,
        payload,
        suspiciousActivity: suspiciousPatterns.length > 0 ? suspiciousPatterns : undefined,
      };

    } catch (error) {
      this.logger.debug(`Token validation failed: ${error.message}`);
      return { isValid: false };
    }
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshToken(
    refreshToken: string,
    deviceFingerprint: DeviceFingerprint
  ): Promise<TokenPair> {
    const validation = await this.validateToken(refreshToken, deviceFingerprint, 'refresh');
    
    if (!validation.isValid || !validation.payload) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { sub: userId, email, role, branch } = validation.payload;

    // Generate new token pair
    return this.generateTokenPair(userId, email, role, deviceFingerprint, branch);
  }

  /**
   * Blacklist a token (logout)
   */
  async blacklistToken(token: string): Promise<void> {
    try {
      const payload = this.jwtService.decode(token) as JwtPayload;
      if (payload && payload.exp) {
        await this.redisService.blacklistToken(token, payload.exp);
        this.logger.debug(`Token blacklisted for user ${payload.sub}`);
      }
    } catch (error) {
      this.logger.error('Failed to blacklist token:', error);
      throw error;
    }
  }

  /**
   * Logout user from specific device
   */
  async logoutDevice(userId: string, deviceFingerprint: string): Promise<void> {
    await this.redisService.removeDeviceSession(userId, deviceFingerprint);
    this.logger.debug(`Device session removed for user ${userId}`);
  }

  /**
   * Logout user from all devices
   */
  async logoutAllDevices(userId: string): Promise<void> {
    const activeSessions = await this.redisService.getUserSessions(userId);
    
    for (const deviceFingerprint of activeSessions) {
      await this.redisService.removeDeviceSession(userId, deviceFingerprint);
    }
    
    this.logger.debug(`All device sessions removed for user ${userId} (${activeSessions.length} devices)`);
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessions(userId: string): Promise<any[]> {
    const deviceFingerprints = await this.redisService.getUserSessions(userId);
    const sessions = [];

    for (const fingerprint of deviceFingerprints) {
      const session = await this.redisService.getDeviceSession(userId, fingerprint);
      if (session) {
        sessions.push({
          deviceFingerprint: fingerprint,
          ...session,
        });
      }
    }

    return sessions;
  }

  /**
   * Check for suspicious activity
   */
  async checkSuspiciousActivity(userId: string): Promise<{ [key: string]: number }> {
    // This would need to be implemented in RedisService to get counts
    // For now, return empty object
    return {};
  }

  /**
   * Update last access time for a session
   */
  private async updateLastAccess(userId: string, deviceFingerprint: string): Promise<void> {
    const session = await this.redisService.getDeviceSession(userId, deviceFingerprint);
    if (session) {
      session.lastAccess = new Date();
      await this.redisService.storeDeviceSession(
        userId,
        deviceFingerprint,
        session,
        this.refreshTokenTTL
      );
    }
  }

  /**
   * Generate a unique JWT ID
   */
  private generateJTI(): string {
    return require('crypto').randomBytes(16).toString('hex');
  }
}
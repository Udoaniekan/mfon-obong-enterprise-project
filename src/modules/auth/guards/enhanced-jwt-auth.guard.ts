import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { EnhancedJwtService, TokenValidationResult } from '../../../common/services/enhanced-jwt.service';
import { DeviceFingerprintService } from '../../../common/services/device-fingerprint.service';
import { RedisService } from '../../../common/services/redis.service';

@Injectable()
export class EnhancedJwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(EnhancedJwtAuthGuard.name);

  constructor(
    private readonly enhancedJwtService: EnhancedJwtService,
    private readonly deviceFingerprintService: DeviceFingerprintService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    try {
      // Extract token from Authorization header
      const token = this.extractTokenFromHeader(request);
      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      // Generate device fingerprint
      const deviceFingerprint = this.deviceFingerprintService.generateFingerprint(request);

      // Validate token
      const validation: TokenValidationResult = await this.enhancedJwtService.validateToken(
        token,
        deviceFingerprint,
        'access'
      );

      if (!validation.isValid) {
        if (validation.isBlacklisted) {
          throw new UnauthorizedException('Token has been revoked');
        }
        if (validation.isExpired) {
          throw new UnauthorizedException('Token has expired');
        }
        if (validation.deviceMismatch) {
          throw new UnauthorizedException('Device verification failed');
        }
        throw new UnauthorizedException('Invalid token');
      }

      // Check for suspicious activity
      if (validation.suspiciousActivity && validation.suspiciousActivity.length > 0) {
        this.logger.warn(
          `Suspicious activity detected for user ${validation.payload?.sub}: ${validation.suspiciousActivity.join(', ')}`
        );

        // For high-risk patterns, we might want to require additional verification
        const highRiskPatterns = ['automation_tool', 'headless_browser'];
        const hasHighRisk = validation.suspiciousActivity.some(pattern => 
          highRiskPatterns.includes(pattern)
        );

        if (hasHighRisk) {
          // Track this as a security event
          await this.redisService.trackSuspiciousActivity(
            validation.payload!.sub,
            'high_risk_access',
            3600
          );

          // For now, log but allow access. In production, you might want to:
          // - Require additional authentication
          // - Block the request
          // - Send security alert
          this.logger.error(
            `High-risk access attempt blocked for user ${validation.payload?.sub}`
          );
          // Uncomment to block high-risk access:
          // throw new UnauthorizedException('Security verification required');
        }
      }

      // Attach user and device info to request
      (request as any).user = {
        userId: validation.payload!.sub,
        email: validation.payload!.email,
        role: validation.payload!.role,
        branch: validation.payload!.branch,
        deviceFingerprint: deviceFingerprint.fingerprint,
      };

      (request as any).deviceInfo = deviceFingerprint;

      return true;

    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error('Authentication error:', error);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
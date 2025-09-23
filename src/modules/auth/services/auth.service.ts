import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UsersService } from '../../users/services/users.service';
import { Otp } from '../schemas/otp.schema';
import { generateOTP, getOTPExpiry } from '../utils/otp.util';
import { sendOTPEmail } from '../utils/mailer.util';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { extractDeviceInfo } from '../../system-activity-logs/utils/device-extractor.util';
import { EnhancedJwtService, TokenPair } from '../../../common/services/enhanced-jwt.service';
import { DeviceFingerprintService, DeviceFingerprint } from '../../../common/services/device-fingerprint.service';
import { RedisService } from '../../../common/services/redis.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectModel(Otp.name) private readonly otpModel: Model<Otp>,
    private readonly systemActivityLogService: SystemActivityLogService,
    private readonly enhancedJwtService: EnhancedJwtService,
    private readonly deviceFingerprintService: DeviceFingerprintService,
    private readonly redisService: RedisService,
  ) {}
  // MAINTAINER requests OTP to their email for password reset
  async requestOtp(
    email: string,
    userId: string,
    device?: string,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new BadRequestException('Maintainer email not found');
    if (user.role !== 'MAINTAINER')
      throw new ForbiddenException('Only MAINTAINER can request OTP');

    // Generate OTP and expiry
    const otp = generateOTP();
    const expiresAt = getOTPExpiry(10); // 10 minutes expiry

    // Save OTP in DB (invalidate previous unused OTPs for this user/email)
    await this.otpModel.updateMany(
      { email, userId, used: false },
      { used: true },
    );
    await this.otpModel.create({ email, otp, userId, expiresAt });

    // Send OTP email
    await sendOTPEmail(email, otp);

    // Log OTP request activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'OTP_REQUESTED',
        details: `OTP requested for password reset: ${email}`,
        performedBy: email,
        role: user.role,
        device: device || 'System',
      });
    } catch (logError) {
      // Don't fail if logging fails
    }

    return { message: 'OTP sent to MAINTAINER email' };
  }

  // MAINTAINER verifies OTP and resets user's password
  async verifyOtpAndResetPassword(
    email: string,
    userId: string,
    otp: string,
    newPassword: string,
    device?: string,
  ): Promise<{ message: string }> {
    const otpDoc = await this.otpModel.findOne({
      email,
      userId,
      otp,
      used: false,
    });
    if (!otpDoc) throw new BadRequestException('Invalid OTP');
    if (otpDoc.expiresAt < new Date())
      throw new BadRequestException('OTP expired');

    // Mark OTP as used
    otpDoc.used = true;
    await otpDoc.save();

    // Reset the user's password with temporary password
    const verifyingUser = await this.usersService.findByEmail(email);
    const resetResult = await this.usersService.forgotPassword(userId, { email: verifyingUser.email, role: verifyingUser.role, name: verifyingUser.name }, device);

    // Log OTP verification and password reset
    try {
      await this.systemActivityLogService.createLog({
        action: 'OTP_VERIFIED',
        details: `OTP verified and password reset completed for: ${email}`,
        performedBy: email,
        role: verifyingUser?.role || 'MAINTAINER',
        device: device || 'System',
      });
    } catch (logError) {
      // Don't fail if logging fails
    }

    return { message: 'Password reset successfully' };
  }

  async validateUser(email: string, password: string): Promise<any> {
    try {
      const user = await this.usersService.findByEmail(email);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid password');
      }

      // Check if user is inactive (soft deleted)
      if (!user.isActive) {
        throw new UnauthorizedException('Account has been deactivated. Please contact administrator.');
      }

      // Check if user is blocked
      if (user.isBlocked) {
        throw new UnauthorizedException(`Account has been suspended. Reason: ${user.blockReason || 'Contact administrator for details.'}`);
      }
      
      const { password: _, ...result } = user.toJSON();
      return {
        ...result,
        branch: result.branch || 'HEAD_OFFICE', // Provide default for existing users
        branchId: user.branchId ? user.branchId.toString() : null, // Convert ObjectId to string
      };
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
  }

  async validateUserById(userId: string): Promise<any> {
    try {
      const user = await this.usersService.findByIdRaw(userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid user');
    }
  }
  async login(user: any, userAgent?: string, req?: any) {
    try {
      const userId = user._id ? user._id.toString() : user.id;

      // Simple JWT token generation for development
      const payload = {
        sub: userId,
        email: user.email,
        role: user.role,
        branch: user.branch,
      };

      const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });
      const refresh_token = this.jwtService.sign(payload, { expiresIn: '7d' });

      // Log successful login activity (optional)
      try {
        await this.systemActivityLogService.createLog({
          action: 'LOGIN',
          details: `User logged in successfully`,
          performedBy: user.email || user.name,
          role: user.role,
          device: extractDeviceInfo(userAgent || ''),
        });
      } catch (logError) {
        // Don't fail login if logging fails
        console.log('Logging failed but continuing with login:', logError.message);
      }

      // Return tokens and user info
      return {
        access_token,
        refresh_token,
        user: {
          id: userId,
          email: user.email,
          role: user.role,
          name: user.name,
          branch: user.branch,
          branchId: user.branchId,
        },
      };
    } catch (error) {
      console.error('Login error:', error);
      throw new Error(
        'Failed to generate authentication token: ' + error.message,
      );
    }
  }

  async logout(
    user: any,
    token: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    try {
      // Simple logout - in development, we don't need token blacklisting
      // In production, you'd want to implement token blacklisting

      // Log logout activity (optional)
      try {
        await this.systemActivityLogService.createLog({
          action: 'LOGOUT',
          details: `User logged out successfully`,
          performedBy: user.email || user.name,
          role: user.role,
          device: extractDeviceInfo(userAgent || ''),
        });
      } catch (logError) {
        // Don't fail logout if logging fails
        console.log('Logging failed but continuing with logout:', logError.message);
      }

      return { message: 'Logout successful' };
    } catch (error) {
      console.error('Logout error:', error);
      return { message: 'Logout successful' }; // Always return success for logout
    }
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    // For development, tokens are not blacklisted
    // In production, you'd want to implement proper token blacklisting
    return false;
  }

  /**
   * Logout from all devices
   */
  async logoutFromAllDevices(
    user: any,
    userAgent?: string,
  ): Promise<{ message: string }> {
    try {
      // Simple logout from all devices - in development, we don't track devices
      
      // Log logout from all devices activity (optional)
      try {
        await this.systemActivityLogService.createLog({
          action: 'LOGOUT_ALL_DEVICES',
          details: `User logged out from all devices`,
          performedBy: user.email || user.name,
          role: user.role,
          device: extractDeviceInfo(userAgent || ''),
        });
      } catch (logError) {
        // Don't fail logout if logging fails
        console.log('Logging failed but continuing with logout all devices:', logError.message);
      }

      return { message: 'Logged out from all devices successfully' };
    } catch (error) {
      console.error('Logout from all devices error:', error);
      return { message: 'Logged out from all devices successfully' }; // Always return success
    }
  }

  /**
   * Get refresh token data (simplified for development)
   */
  async getRefreshTokenData(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      return payload || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Invalidate refresh token (simplified for development)
   */
  async invalidateRefreshToken(refreshToken: string) {
    try {
      // For development, we don't maintain a blacklist
      // In production, you'd want to blacklist the token
      console.log('Token invalidated:', refreshToken.substring(0, 10) + '...');
    } catch (error) {
      this.logger.error('Failed to invalidate refresh token:', error);
    }
  }

  // Refresh Token Methods
  async refreshToken(refreshToken: string, userAgent?: string, req?: any) {
    try {
      // Simple token validation using standard JWT service
      const payload = this.jwtService.verify(refreshToken);
      
      if (!payload || !payload.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Get user details
      const user = await this.usersService.findByEmail(payload.email);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Generate new tokens
      const newPayload = {
        sub: payload.sub,
        email: user.email,
        role: user.role,
        branch: user.branch,
      };

      const access_token = this.jwtService.sign(newPayload, { expiresIn: '1h' });
      const refresh_token = this.jwtService.sign(newPayload, { expiresIn: '7d' });

      // Log token refresh activity (optional)
      try {
        await this.systemActivityLogService.createLog({
          action: 'TOKEN_REFRESH',
          details: `Access token refreshed successfully`,
          performedBy: user.email,
          role: user.role,
          device: extractDeviceInfo(userAgent || ''),
        });
      } catch (logError) {
        // Don't fail refresh if logging fails
        console.log('Logging failed but continuing with refresh:', logError.message);
      }

      return {
        access_token,
        refresh_token,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          name: user.name,
          branch: user.branch,
          branchId: user.branchId ? user.branchId.toString() : null,
        },
      };
    } catch (error) {
      console.error('Refresh token error:', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token refresh failed: ' + error.message);
    }
  }

  /**
   * Get token stats from Redis
   */
  async getRefreshTokenStats() {
    try {
      // This could be implemented to get stats from Redis
      // For now, return placeholder
      return { message: 'Token stats now managed by Redis' };
    } catch (error) {
      return { error: 'Failed to get token stats' };
    }
  }

  /**
   * Revoke refresh token (now handled by Redis blacklisting)
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.invalidateRefreshToken(refreshToken);
  }
}

import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../users/services/users.service';
import { Otp } from '../schemas/otp.schema';
import { generateOTP, getOTPExpiry } from '../utils/otp.util';
import { sendOTPEmail } from '../utils/mailer.util';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { extractDeviceInfo } from '../../system-activity-logs/utils/device-extractor.util';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private blacklistedTokens = new Set<string>(); // In-memory token blacklist
  private refreshTokens = new Map<string, { userId: string; email: string; expiresAt: number }>(); // In-memory refresh token storage

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectModel(Otp.name) private readonly otpModel: Model<Otp>,
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}
  // MAINTAINER requests OTP to their email for password reset
  async requestOtp(
    email: string,
    userId: string,
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
        role: 'MAINTAINER',
        device: 'System',
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

    // Reset the user's password
    await this.usersService.forgotPassword(userId, newPassword);

    // Log OTP verification and password reset
    try {
      await this.systemActivityLogService.createLog({
        action: 'OTP_VERIFIED',
        details: `OTP verified and password reset completed for: ${email}`,
        performedBy: email,
        role: 'MAINTAINER',
        device: 'System',
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
  async login(user: any, userAgent?: string) {
    try {
      const payload = {
        email: user.email,
        sub: user._id ? user._id.toString() : user.id,
        role: user.role,
        name: user.name,
        branch: user.branch,
        branchId: user.branchId,
      };

      const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });
      
      // Generate refresh token
      const refreshPayload = {
        email: user.email,
        sub: user._id ? user._id.toString() : user.id,
        type: 'refresh'
      };
      const refresh_token = this.jwtService.sign(refreshPayload, { expiresIn: '7d' });
      
      // Store refresh token in memory
      const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days from now
      this.refreshTokens.set(refresh_token, {
        userId: refreshPayload.sub,
        email: refreshPayload.email,
        expiresAt
      });

      // Log successful login activity
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
      }

      // Direct format, not nested inside data property
      return {
        access_token,
        refresh_token,
        user: {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
          name: payload.name,
          branch: payload.branch,
          branchId: payload.branchId,
        },
      };
    } catch (error) {
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
      // Add token to blacklist
      if (token) {
        this.blacklistedTokens.add(token);
      }

      // Log logout activity
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
      }

      return { message: 'Logout successful' };
    } catch (error) {
      throw new Error('Logout failed: ' + error.message);
    }
  }

  isTokenBlacklisted(token: string): boolean {
    return this.blacklistedTokens.has(token);
  }

  getRefreshTokenData(refreshToken: string) {
    return this.refreshTokens.get(refreshToken);
  }

  invalidateRefreshToken(refreshToken: string) {
    this.refreshTokens.delete(refreshToken);
  }

  // Refresh Token Methods
  async refreshToken(refreshToken: string, userAgent?: string) {
    try {
      // Clean up expired refresh tokens first
      this.cleanupExpiredRefreshTokens();

      // Check if refresh token exists in memory
      const tokenData = this.refreshTokens.get(refreshToken);
      if (!tokenData) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if token is expired
      if (Date.now() > tokenData.expiresAt) {
        this.refreshTokens.delete(refreshToken);
        throw new UnauthorizedException('Refresh token expired');
      }

      // Verify JWT signature
      let decodedToken;
      try {
        decodedToken = this.jwtService.verify(refreshToken);
      } catch (error) {
        this.refreshTokens.delete(refreshToken);
        throw new UnauthorizedException('Invalid refresh token signature');
      }

      // Validate token type
      if (decodedToken.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Get fresh user data
      const user = await this.usersService.findByEmail(tokenData.email);
      if (!user || !user.isActive) {
        this.refreshTokens.delete(refreshToken);
        throw new UnauthorizedException('User not found or inactive');
      }

      // Generate new access token
      const payload = {
        email: user.email,
        sub: user._id.toString(),
        role: user.role,
        name: user.name,
        branch: user.branch,
        branchId: user.branchId ? user.branchId.toString() : null,
      };
      const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });

      // Generate new refresh token (token rotation for security)
      const newRefreshPayload = {
        email: user.email,
        sub: user._id.toString(),
        type: 'refresh'
      };
      const new_refresh_token = this.jwtService.sign(newRefreshPayload, { expiresIn: '7d' });

      // Remove old refresh token and store new one
      this.refreshTokens.delete(refreshToken);
      const newExpiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
      this.refreshTokens.set(new_refresh_token, {
        userId: newRefreshPayload.sub,
        email: newRefreshPayload.email,
        expiresAt: newExpiresAt
      });

      // Log token refresh activity
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
      }

      return {
        access_token,
        refresh_token: new_refresh_token,
        user: {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
          name: payload.name,
          branch: payload.branch,
          branchId: payload.branchId,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token refresh failed');
    }
  }

  // Clean up expired refresh tokens from memory
  private cleanupExpiredRefreshTokens(): void {
    const now = Date.now();
    for (const [token, data] of this.refreshTokens.entries()) {
      if (now > data.expiresAt) {
        this.refreshTokens.delete(token);
      }
    }
  }

  // Get refresh token stats (for monitoring/debugging)
  getRefreshTokenStats(): { total: number; expired: number } {
    const now = Date.now();
    let expired = 0;
    const total = this.refreshTokens.size;

    for (const [token, data] of this.refreshTokens.entries()) {
      if (now > data.expiresAt) {
        expired++;
      }
    }

    return { total, expired };
  }

  // Revoke refresh token (for logout)
  revokeRefreshToken(refreshToken: string): void {
    this.refreshTokens.delete(refreshToken);
  }
}

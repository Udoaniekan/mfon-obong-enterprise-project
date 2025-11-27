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
import { RefreshToken } from '../schemas/refresh-token.schema';
import { generateOTP, getOTPExpiry } from '../utils/otp.util';
import { sendOTPEmail } from '../utils/mailer.util';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { extractDeviceInfo } from '../../system-activity-logs/utils/device-extractor.util';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private blacklistedTokens = new Set<string>(); // In-memory token blacklist

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectModel(Otp.name) private readonly otpModel: Model<Otp>,
    @InjectModel(RefreshToken.name) private readonly refreshTokenModel: Model<RefreshToken>,
    private readonly systemActivityLogService: SystemActivityLogService,
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

      // Store refresh token in database (persisted across restarts)
      const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days from now
      await this.refreshTokenModel.create({
        token: refresh_token,
        userId: refreshPayload.sub,
        email: refreshPayload.email,
        expiresAt,
        userAgent: extractDeviceInfo(userAgent || ''),
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
          profilePicture: user.profilePicture,
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

  async getRefreshTokenData(refreshToken: string) {
    return await this.refreshTokenModel.findOne({ token: refreshToken, revoked: false });
  }

  async invalidateRefreshToken(refreshToken: string) {
    await this.refreshTokenModel.updateOne(
      { token: refreshToken },
      { revoked: true }
    );
  }

  // Refresh Token Methods
  async refreshToken(refreshToken: string, userAgent?: string) {
    try {
      // Check if refresh token exists in database
      const tokenDoc = await this.refreshTokenModel.findOne({
        token: refreshToken,
        revoked: false,
      });

      if (!tokenDoc) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if token is expired
      if (new Date() > tokenDoc.expiresAt) {
        await this.refreshTokenModel.updateOne(
          { _id: tokenDoc._id },
          { revoked: true }
        );
        throw new UnauthorizedException('Refresh token expired');
      }

      // Verify JWT signature
      let decodedToken;
      try {
        decodedToken = this.jwtService.verify(refreshToken);
      } catch (error) {
        await this.refreshTokenModel.updateOne(
          { _id: tokenDoc._id },
          { revoked: true }
        );
        throw new UnauthorizedException('Invalid refresh token signature');
      }

      // Validate token type
      if (decodedToken.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Get fresh user data
      const user = await this.usersService.findByEmail(tokenDoc.email);
      if (!user || !user.isActive) {
        await this.refreshTokenModel.updateOne(
          { _id: tokenDoc._id },
          { revoked: true }
        );
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

      // Revoke old refresh token and store new one in database
      await this.refreshTokenModel.updateOne(
        { _id: tokenDoc._id },
        { revoked: true }
      );

      const newExpiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
      await this.refreshTokenModel.create({
        token: new_refresh_token,
        userId: newRefreshPayload.sub,
        email: newRefreshPayload.email,
        expiresAt: newExpiresAt,
        userAgent: extractDeviceInfo(userAgent || ''),
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
          profilePicture: user.profilePicture,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token refresh failed');
    }
  }

  // Get refresh token stats (for monitoring/debugging)
  async getRefreshTokenStats(): Promise<{ total: number; expired: number; active: number }> {
    const now = new Date();
    const total = await this.refreshTokenModel.countDocuments({ revoked: false });
    const expired = await this.refreshTokenModel.countDocuments({
      revoked: false,
      expiresAt: { $lt: now }
    });
    const active = total - expired;

    return { total, expired, active };
  }

  // Revoke refresh token (for logout)
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.refreshTokenModel.updateOne(
      { token: refreshToken },
      { revoked: true }
    );
  }

  // Clean up expired tokens (can be called by a cron job)
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenModel.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    return result.deletedCount;
  }
}

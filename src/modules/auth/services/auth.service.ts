import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsersService } from '../../users/services/users.service';
import { generateOTP, getOTPExpiry } from '../utils/otp.util';
import { sendOTPEmail } from '../utils/mailer.util';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { extractDeviceInfo } from '../../system-activity-logs/utils/device-extractor.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}

  async requestOtp(
    email: string,
    userId: string,
    device?: string,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new BadRequestException('Maintainer email not found');
    if (user.role !== 'MAINTAINER') throw new ForbiddenException('Only MAINTAINER can request OTP');

    const otp = generateOTP();
    const expiresAt = getOTPExpiry(10);

    await this.prisma.otp.updateMany({
      where: { email, userId, used: false },
      data: { used: true },
    });
    await this.prisma.otp.create({ data: { email, otp, userId, expiresAt } });

    await sendOTPEmail(email, otp);

    try {
      await this.systemActivityLogService.createLog({
        action: 'OTP_REQUESTED',
        details: `OTP requested for password reset: ${email}`,
        performedBy: email,
        role: user.role,
        device: device || 'System',
      });
    } catch {}

    return { message: 'OTP sent to MAINTAINER email' };
  }

  async verifyOtpAndResetPassword(
    email: string,
    userId: string,
    otp: string,
    newPassword: string,
    device?: string,
  ): Promise<{ message: string }> {
    const otpDoc = await this.prisma.otp.findFirst({
      where: { email, userId, otp, used: false },
    });
    if (!otpDoc) throw new BadRequestException('Invalid OTP');
    if (otpDoc.expiresAt < new Date()) throw new BadRequestException('OTP expired');

    await this.prisma.otp.update({ where: { id: otpDoc.id }, data: { used: true } });

    const verifyingUser = await this.usersService.findByEmail(email);
    await this.usersService.forgotPassword(userId, {
      email: verifyingUser.email,
      role: verifyingUser.role,
      name: verifyingUser.name,
    }, device);

    try {
      await this.systemActivityLogService.createLog({
        action: 'OTP_VERIFIED',
        details: `OTP verified and password reset completed for: ${email}`,
        performedBy: email,
        role: verifyingUser?.role || 'MAINTAINER',
        device: device || 'System',
      });
    } catch {}

    return { message: 'Password reset successfully' };
  }

  async validateUser(email: string, password: string): Promise<any> {
    try {
      const user = await this.usersService.findByEmail(email);
      if (!user) throw new UnauthorizedException('User not found');

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) throw new UnauthorizedException('Invalid password');

      if (!user.isActive) {
        throw new UnauthorizedException('Account has been deactivated. Please contact administrator.');
      }
      if (user.isBlocked) {
        throw new UnauthorizedException(`Account has been suspended. Reason: ${user.blockReason || 'Contact administrator for details.'}`);
      }

      const { password: _, ...result } = user;
      return {
        ...result,
        branch: result.branch || 'HEAD_OFFICE',
        branchId: user.branchId || null,
      };
    } catch (error: any) {
      throw new UnauthorizedException(error.message);
    }
  }

  async validateUserById(userId: string): Promise<any> {
    try {
      const user = await this.usersService.findByIdRaw(userId);
      if (!user) throw new UnauthorizedException('User not found');
      return user;
    } catch (error: any) {
      throw new UnauthorizedException('Invalid user');
    }
  }

  async login(user: any, userAgent?: string) {
    try {
      const payload = {
        email: user.email,
        sub: user.id || user._id,
        role: user.role,
        name: user.name,
        branch: user.branch,
        branchId: user.branchId,
      };

      const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });

      const refreshPayload = {
        email: user.email,
        sub: user.id || user._id,
        type: 'refresh',
      };
      const refresh_token = this.jwtService.sign(refreshPayload, { expiresIn: '7d' });

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await this.prisma.refreshToken.create({
        data: {
          token: refresh_token,
          userId: refreshPayload.sub,
          email: refreshPayload.email,
          expiresAt,
          userAgent: extractDeviceInfo(userAgent || ''),
        },
      });

      try {
        await this.systemActivityLogService.createLog({
          action: 'LOGIN',
          details: `User logged in successfully`,
          performedBy: user.email || user.name,
          role: user.role,
          device: extractDeviceInfo(userAgent || ''),
          branchId: user.branchId?.toString(),
        });
      } catch {}

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
    } catch (error: any) {
      throw new Error('Failed to generate authentication token: ' + error?.message);
    }
  }

  async logout(
    user: any,
    token: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    try {
      if (token) {
        let expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        try {
          const decoded = this.jwtService.decode(token) as any;
          if (decoded?.exp) expiresAt = new Date(decoded.exp * 1000);
        } catch {}
        await this.prisma.blacklistedToken.create({ data: { token, expiresAt } }).catch(() => {});
      }

      try {
        await this.systemActivityLogService.createLog({
          action: 'LOGOUT',
          details: `User logged out successfully`,
          performedBy: user.email || user.name,
          role: user.role,
          device: extractDeviceInfo(userAgent || ''),
          branchId: user.branchId?.toString(),
        });
      } catch {}

      return { message: 'Logout successful' };
    } catch (error: any) {
      throw new Error('Logout failed: ' + error?.message);
    }
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const doc = await this.prisma.blacklistedToken.findUnique({ where: { token } });
    return !!doc;
  }

  async getRefreshTokenData(refreshToken: string) {
    return this.prisma.refreshToken.findFirst({
      where: { token: refreshToken, revoked: false },
    });
  }

  async invalidateRefreshToken(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revoked: true },
    });
  }

  async refreshToken(refreshToken: string, userAgent?: string) {
    try {
      const tokenDoc = await this.prisma.refreshToken.findFirst({
        where: { token: refreshToken, revoked: false },
      });

      if (!tokenDoc) throw new UnauthorizedException('Invalid refresh token');

      if (new Date() > tokenDoc.expiresAt) {
        await this.prisma.refreshToken.update({
          where: { id: tokenDoc.id },
          data: { revoked: true },
        });
        throw new UnauthorizedException('Refresh token expired');
      }

      let decodedToken: any;
      try {
        decodedToken = this.jwtService.verify(refreshToken);
      } catch {
        await this.prisma.refreshToken.update({
          where: { id: tokenDoc.id },
          data: { revoked: true },
        });
        throw new UnauthorizedException('Invalid refresh token signature');
      }

      if (decodedToken.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.usersService.findByEmail(tokenDoc.email);
      if (!user || !user.isActive) {
        await this.prisma.refreshToken.update({
          where: { id: tokenDoc.id },
          data: { revoked: true },
        });
        throw new UnauthorizedException('User not found or inactive');
      }

      const payload = {
        email: user.email,
        sub: user.id || user._id,
        role: user.role,
        name: user.name,
        branch: user.branch,
        branchId: user.branchId || null,
      };
      const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });

      const newRefreshPayload = {
        email: user.email,
        sub: user.id || user._id,
        type: 'refresh',
      };
      const new_refresh_token = this.jwtService.sign(newRefreshPayload, { expiresIn: '7d' });

      await this.prisma.refreshToken.update({
        where: { id: tokenDoc.id },
        data: { revoked: true },
      });

      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await this.prisma.refreshToken.create({
        data: {
          token: new_refresh_token,
          userId: newRefreshPayload.sub,
          email: newRefreshPayload.email,
          expiresAt: newExpiresAt,
          userAgent: extractDeviceInfo(userAgent || ''),
        },
      });

      try {
        await this.systemActivityLogService.createLog({
          action: 'TOKEN_REFRESH',
          details: `Access token refreshed successfully`,
          performedBy: user.email,
          role: user.role,
          device: extractDeviceInfo(userAgent || ''),
        });
      } catch {}

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
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Token refresh failed');
    }
  }

  async getRefreshTokenStats(): Promise<{ total: number; expired: number; active: number }> {
    const now = new Date();
    const total = await this.prisma.refreshToken.count({ where: { revoked: false } });
    const expired = await this.prisma.refreshToken.count({
      where: { revoked: false, expiresAt: { lt: now } },
    });
    return { total, expired, active: total - expired };
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revoked: true },
    });
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}

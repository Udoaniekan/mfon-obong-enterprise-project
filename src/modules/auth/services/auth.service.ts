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
      console.error('Failed to log OTP request:', logError);
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
      console.error('Failed to log OTP verification:', logError);
    }

    return { message: 'Password reset successfully' };
  }

  async validateUser(email: string, password: string): Promise<any> {
    try {
      console.log('Attempting to validate user:', email);

      const user = await this.usersService.findByEmail(email);
      if (!user) {
        console.log('User not found:', email);
        throw new UnauthorizedException('User not found');
      }

      console.log('User found, validating password');
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        console.log('Invalid password for user:', email);
        throw new UnauthorizedException('Invalid password');
      }
      console.log('Password valid, login successful');
      const { password: _, ...result } = user.toJSON();
      console.log('User data before return:', result);
      return {
        ...result,
        branch: result.branch || 'HEAD_OFFICE', // Provide default for existing users
      };
    } catch (error) {
      console.error('Login error:', error.message);
      throw new UnauthorizedException(error.message);
    }
  }
  async login(user: any, userAgent?: string) {
    try {
      console.log('Creating JWT payload for user:', user.email);
      const payload = {
        email: user.email,
        sub: user._id ? user._id.toString() : user.id,
        role: user.role,
        name: user.name,
        branch: user.branch,
      };
      console.log('JWT Payload:', payload);

      const access_token = this.jwtService.sign(payload, { expiresIn: '24h' });
      console.log('JWT Token generated successfully');

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
        console.error('Failed to log login activity:', logError);
        // Don't fail login if logging fails
      }

      // Direct format, not nested inside data property
      return {
        access_token,
        user: {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
          name: payload.name,
          branch: payload.branch,
        },
      };
    } catch (error) {
      console.error('Error generating JWT token:', error);
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
        console.error('Failed to log logout activity:', logError);
        // Don't fail logout if logging fails
      }

      return { message: 'Logout successful' };
    } catch (error) {
      console.error('Error during logout:', error);
      throw new Error('Logout failed: ' + error.message);
    }
  }

  isTokenBlacklisted(token: string): boolean {
    return this.blacklistedTokens.has(token);
  }
}

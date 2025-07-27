import { Controller, Post, Body, Request, UseGuards } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { OtpRequestDto, OtpVerifyDto } from '../dto/otp-request.dto';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthGuard('local'))
  @Post('/login')
  async login(@Request() req) {
    console.log('Login request user:', req.user);
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.login(req.user, userAgent);
    console.log('Login response:', result);
    return result;
  }

  @Post('/request-otp')
  async requestOtp(@Body() dto: OtpRequestDto) {
    return this.authService.requestOtp(dto.email, dto.userId);
  }

  @Post('/verify-otp')
  async verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.authService.verifyOtpAndResetPassword(
      dto.email,
      dto.userId,
      dto.otp,
      dto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('/logout')
  async logout(@Request() req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const userAgent = req.headers['user-agent'];
    return this.authService.logout(req.user, token, userAgent);
  }
}

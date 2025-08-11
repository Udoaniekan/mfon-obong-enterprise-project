import { Controller, Post, Body, Request, UseGuards } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { OtpRequestDto, OtpVerifyDto } from '../dto/otp-request.dto';
import { RefreshTokenDto } from '../dto/auth.dto';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthGuard('local'))
  @Post('/login')
  async login(@Request() req) {
    const userAgent = req.headers['user-agent'];
    return this.authService.login(req.user, userAgent);
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

  @Post('/refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto, @Request() req) {
    const userAgent = req.headers['user-agent'];
    return this.authService.refreshToken(refreshTokenDto.refresh_token, userAgent);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/logout')
  async logout(@Request() req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const userAgent = req.headers['user-agent'];
    return this.authService.logout(req.user, token, userAgent);
  }
}

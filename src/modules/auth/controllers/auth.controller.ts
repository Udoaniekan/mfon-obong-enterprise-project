import { Controller, Post, Body, Request, Response, UseGuards, BadRequestException } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { OtpRequestDto, OtpVerifyDto } from '../dto/otp-request.dto';
import { RefreshTokenDto } from '../dto/auth.dto';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CookieConfigUtil } from '../utils/cookie-config.util';

@Controller('/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthGuard('local'))
  @Post('/login')
  async login(@Request() req, @Response({ passthrough: true }) res) {
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.login(req.user, userAgent);
    
    // Use consistent cookie configuration
    const accessTokenOptions = CookieConfigUtil.getAccessTokenOptions();
    const refreshTokenOptions = CookieConfigUtil.getRefreshTokenOptions();
    
    console.log('Setting authentication cookies:', { 
      NODE_ENV: process.env.NODE_ENV,
      accessTokenOptions,
      refreshTokenOptions
    });
    
    res.cookie('accessToken', result.access_token, accessTokenOptions);
    res.cookie('refreshToken', result.refresh_token, refreshTokenOptions);
    
    console.log('✅ Cookies set with consistent configuration');
    
    // Return user info WITH tokens for backwards compatibility
    return {
      user: result.user,
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      message: 'Login successful'
    };
  }

  // OTP endpoints removed - using admin password reset instead
  // Admin can reset any user's password directly through user management

  @Post('/refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto, @Request() req, @Response({ passthrough: true }) res) {
    const userAgent = req.headers['user-agent'];
    
    // Try to get refresh token from cookies first, then from body
    const refreshToken = req.cookies?.refreshToken || refreshTokenDto.refresh_token;
    
    if (!refreshToken) {
      throw new BadRequestException('No refresh token provided. Please provide token in body or ensure you are logged in with cookies.');
    }
    
    const result = await this.authService.refreshToken(refreshToken, userAgent);
    
    // Use consistent cookie configuration for refresh endpoint
    const cookieOptions = CookieConfigUtil.getRefreshEndpointOptions();
    
    res.cookie('accessToken', result.access_token, cookieOptions.accessToken);
    res.cookie('refreshToken', result.refresh_token, cookieOptions.refreshToken);
    
    // Return user info without tokens
    return {
      user: result.user,
      message: 'Token refreshed successfully'
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('/logout')
  async logout(@Request() req, @Response({ passthrough: true }) res) {
    // Get token from cookies or header
    const token = req.cookies?.accessToken || req.headers.authorization?.replace('Bearer ', '');
    const refreshToken = req.cookies?.refreshToken;
    const userAgent = req.headers['user-agent'];
    
    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    
    // Blacklist tokens in AuthService
    const result = await this.authService.logout(req.user, token, userAgent);
    
    // Also invalidate refresh token if it exists
    if (refreshToken) {
      this.authService.invalidateRefreshToken(refreshToken);
    }
    
    return {
      message: 'Logout successful'
    };
  }
}

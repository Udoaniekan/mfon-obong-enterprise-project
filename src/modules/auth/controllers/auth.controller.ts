import { Controller, Post, Body, Request, Response, UseGuards, BadRequestException } from '@nestjs/common';
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
  async login(@Request() req, @Response({ passthrough: true }) res) {
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.login(req.user, userAgent);
    
    // Set HttpOnly cookies with proper development/production settings
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    console.log('Setting authentication cookies:', { 
      isProduction, 
      isDevelopment,
      NODE_ENV: process.env.NODE_ENV 
    });
    
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction, // Only secure in production (HTTPS required)
      maxAge: 60 * 60 * 1000, // 1 hour
      sameSite: isProduction ? 'none' as const : 'lax' as const, // 'lax' for development, 'none' for production
    };
    
    const refreshCookieOptions = {
      httpOnly: true,
      secure: isProduction, // Only secure in production
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: isProduction ? 'none' as const : 'lax' as const,
    };
    
    res.cookie('accessToken', result.access_token, cookieOptions);
    res.cookie('refreshToken', result.refresh_token, refreshCookieOptions);
    
    console.log('✅ Cookies set:', {
      accessToken: 'Set with maxAge ' + cookieOptions.maxAge,
      refreshToken: 'Set with maxAge ' + refreshCookieOptions.maxAge,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite
    });
    
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
    
    // Set new cookies
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.cookie('accessToken', result.access_token, {
      httpOnly: true,
      secure: true, // Always secure for cross-origin cookies
      maxAge: 60 * 60 * 1000, // 1 hour
      sameSite: 'none' // Allow cross-origin requests
    });
    
    res.cookie('refreshToken', result.refresh_token, {
      httpOnly: true,
      secure: true, // Always secure for cross-origin cookies
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'none' // Allow cross-origin requests
    });
    
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

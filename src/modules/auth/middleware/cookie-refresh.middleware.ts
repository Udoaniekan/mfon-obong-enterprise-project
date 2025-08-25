import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

@Injectable()
export class CookieRefreshMiddleware implements NestMiddleware {
  constructor(
    private jwtService: JwtService,
    private authService: AuthService
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    // If no access token but refresh token exists, try to refresh
    if (!accessToken && refreshToken) {
      try {
        // Verify refresh token
        const refreshPayload = this.jwtService.verify(refreshToken);
        
        if (refreshPayload.type === 'refresh') {
          // Check if refresh token is still valid in memory
          const tokenData = this.authService.getRefreshTokenData(refreshToken);
          
          if (tokenData && tokenData.expiresAt > Date.now()) {
            // Generate new access token
            const newAccessPayload = {
              email: tokenData.email,
              sub: tokenData.userId,
              role: refreshPayload.role || 'STAFF', // Default role if not in refresh token
              name: refreshPayload.name,
              branch: refreshPayload.branch,
              branchId: refreshPayload.branchId,
            };
            
            const newAccessToken = this.jwtService.sign(newAccessPayload, { expiresIn: '1h' });
            
            // Set new access token cookie
            const isProduction = process.env.NODE_ENV === 'production';
            res.cookie('accessToken', newAccessToken, {
              httpOnly: true,
              secure: isProduction,
              maxAge: 60 * 60 * 1000, // 1 hour
              sameSite: 'lax'
            });
            
            // Add token to request for immediate use
            req.cookies.accessToken = newAccessToken;
          }
        }
      } catch (error) {
        // Refresh token invalid or expired - clear cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
      }
    }

    // If access token exists but is expired, try to refresh
    if (accessToken) {
      try {
        this.jwtService.verify(accessToken);
        // Token is valid, continue
      } catch (error) {
        if (error.name === 'TokenExpiredError' && refreshToken) {
          try {
            // Access token expired, try to refresh
            const refreshPayload = this.jwtService.verify(refreshToken);
            
            if (refreshPayload.type === 'refresh') {
              const tokenData = this.authService.getRefreshTokenData(refreshToken);
              
              if (tokenData && tokenData.expiresAt > Date.now()) {
                // Generate new access token
                const newAccessPayload = {
                  email: tokenData.email,
                  sub: tokenData.userId,
                  role: refreshPayload.role || 'STAFF',
                  name: refreshPayload.name,
                  branch: refreshPayload.branch,
                  branchId: refreshPayload.branchId,
                };
                
                const newAccessToken = this.jwtService.sign(newAccessPayload, { expiresIn: '1h' });
                
                // Set new access token cookie
                const isProduction = process.env.NODE_ENV === 'production';
                res.cookie('accessToken', newAccessToken, {
                  httpOnly: true,
                  secure: isProduction,
                  maxAge: 60 * 60 * 1000, // 1 hour
                  sameSite: 'lax'
                });
                
                // Update request cookie for immediate use
                req.cookies.accessToken = newAccessToken;
              }
            }
          } catch (refreshError) {
            // Both tokens invalid - clear cookies
            res.clearCookie('accessToken');
            res.clearCookie('refreshToken');
          }
        }
      }
    }

    next();
  }
}
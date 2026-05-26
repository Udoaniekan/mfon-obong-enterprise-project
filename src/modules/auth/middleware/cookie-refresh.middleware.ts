import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { CookieConfigUtil } from '../utils/cookie-config.util';

@Injectable()
export class CookieRefreshMiddleware implements NestMiddleware {
  constructor(
    private jwtService: JwtService,
    private authService: AuthService
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    const needsRefresh =
      (!accessToken && refreshToken) ||
      (accessToken && refreshToken && this.isExpired(accessToken));

    if (needsRefresh) {
      await this.tryRefreshFromCookie(refreshToken, req, res);
    }

    next();
  }

  private isExpired(token: string): boolean {
    try {
      this.jwtService.verify(token);
      return false;
    } catch (err:any) {
      return err?.name === 'TokenExpiredError';
    }
  }

  private async tryRefreshFromCookie(refreshToken: string, req: Request, res: Response) {
    try {
      const refreshPayload = this.jwtService.verify(refreshToken);
      if (refreshPayload.type !== 'refresh') return;

      const tokenData = await this.authService.getRefreshTokenData(refreshToken);
      if (!tokenData || new Date() >= tokenData.expiresAt) {
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return;
      }

      // Look up real user from DB so role/name/branch are always correct
      const user = await this.authService.validateUserById(tokenData.userId.toString());
      if (!user || !user.isActive) {
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        return;
      }

      const newAccessPayload = {
        email: user.email,
        sub: tokenData.userId.toString(),
        role: user.role,
        name: user.name,
        branch: user.branch,
        branchId: user.branchId ? user.branchId.toString() : null,
      };

      const newAccessToken = this.jwtService.sign(newAccessPayload, { expiresIn: '1h' });
      const accessTokenOptions = CookieConfigUtil.getAccessTokenOptions();
      res.cookie('accessToken', newAccessToken, accessTokenOptions);
      req.cookies.accessToken = newAccessToken;
    } catch {
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
    }
  }
}
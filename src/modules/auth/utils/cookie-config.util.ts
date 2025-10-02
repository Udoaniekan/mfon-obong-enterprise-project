export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  maxAge: number;
  sameSite: 'strict' | 'lax' | 'none';
}

export class CookieConfigUtil {
  private static isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  static getAccessTokenOptions(): CookieOptions {
    const isProduction = this.isProduction();
    
    return {
      httpOnly: true,
      secure: isProduction, // Only secure in production (HTTPS required)
      maxAge: 60 * 60 * 1000, // 1 hour
      sameSite: isProduction ? 'none' : 'lax', // 'none' for production (cross-origin), 'lax' for development
    };
  }

  static getRefreshTokenOptions(): CookieOptions {
    const isProduction = this.isProduction();
    
    return {
      httpOnly: true,
      secure: isProduction, // Only secure in production
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: isProduction ? 'none' : 'lax', // Same as access token for consistency
    };
  }

  /**
   * Special configuration for refresh endpoint that needs cross-origin support
   * This ensures refresh tokens work across different domains in production
   */
  static getRefreshEndpointOptions(): {
    accessToken: CookieOptions;
    refreshToken: CookieOptions;
  } {
    const isProduction = this.isProduction();
    
    return {
      accessToken: {
        httpOnly: true,
        secure: isProduction, // Always secure for cross-origin in production
        maxAge: 60 * 60 * 1000, // 1 hour
        sameSite: isProduction ? 'none' : 'lax', // Consistent with login
      },
      refreshToken: {
        httpOnly: true,
        secure: isProduction, // Always secure for cross-origin in production
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: isProduction ? 'none' : 'lax', // Consistent with login
      },
    };
  }
}
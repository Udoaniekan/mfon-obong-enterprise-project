import {
  Injectable,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
  ) {
    const jwtSecret =
      configService.get<string>('JWT_SECRET') || 'your-fallback-secret-key';
    console.log('JWT_SECRET from JwtStrategy:', jwtSecret);

    super({
      jwtFromRequest: (req) => {
        // Try to extract from cookies first, fallback to header
        if (req && req.cookies && req.cookies.accessToken) {
          return req.cookies.accessToken;
        }
        // Fallback to Authorization header for backwards compatibility
        return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
      },
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    // Extract token from cookies or header
    let token = req.cookies?.accessToken;
    if (!token) {
      token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    }

    // Check if token is blacklisted
    if (token && this.authService.isTokenBlacklisted(token)) {
      throw new UnauthorizedException('Token has been invalidated');
    }

    // Check if user is still active and not blocked
    try {
      const currentUser = await this.authService.validateUserById(payload.sub);
      if (!currentUser.isActive) {
        throw new UnauthorizedException('Account has been deactivated. Please contact administrator.');
      }
      if (currentUser.isBlocked) {
        throw new UnauthorizedException(`Account has been suspended. Reason: ${currentUser.blockReason || 'Contact administrator for details.'}`);
      }
      // Return the full user object so downstream code has all fields
      return {
        ...(currentUser.toObject ? currentUser.toObject() : currentUser),
        userId: payload.sub, // keep for compatibility
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid user');
    }
  }
}

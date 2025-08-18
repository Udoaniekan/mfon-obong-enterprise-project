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
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    // Check if token is blacklisted
    if (token && this.authService.isTokenBlacklisted(token)) {
      throw new UnauthorizedException('Token has been invalidated');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      branch: payload.branch,
      branchId: payload.branchId,
    };
  }
}

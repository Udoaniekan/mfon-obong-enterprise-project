import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../services/auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'email',
    });
  }
  async validate(email: string, password: string): Promise<any> {
    try {
      const user = await this.authService.validateUser(email, password);
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }
      
      // Ensure we have the required fields for JWT
      if (!user._id && !user.id) {
        console.error('User object missing ID:', user);
        throw new Error('Invalid user object structure');
      }
        return {
        _id: user._id || user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        branch: user.branch,
      };
    } catch (error) {
      console.error('Validation error:', error);
      throw new UnauthorizedException(error.message);
    }
  }
}

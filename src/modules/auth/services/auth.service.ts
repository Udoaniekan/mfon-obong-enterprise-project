import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../users/services/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    try {
      console.log('Attempting to validate user:', email);
      
      const user = await this.usersService.findByEmail(email);
      if (!user) {
        console.log('User not found:', email);
        throw new UnauthorizedException('User not found');
      }
      
      console.log('User found, validating password');
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        console.log('Invalid password for user:', email);
        throw new UnauthorizedException('Invalid password');
      }

      console.log('Password valid, login successful');
      const { password: _, ...result } = user.toJSON();
      return result;
    } catch (error) {
      console.error('Login error:', error.message);
      throw new UnauthorizedException(error.message);
    }
  }  
  async login(user: any) {
    try {
      console.log('Creating JWT payload for user:', user.email);
      const payload = { 
        email: user.email, 
        sub: user._id ? user._id.toString() : user.id,
        role: user.role,
        name: user.name,
      };
      console.log('JWT Payload:', payload);
      
      const access_token = this.jwtService.sign(payload, { expiresIn: '24h' });
      console.log('JWT Token generated successfully');
      
      // Direct format, not nested inside data property
      return {
        access_token,
        user: {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
          name: payload.name,
        }
      };
    } catch (error) {
      console.error('Error generating JWT token:', error);
      throw new Error('Failed to generate authentication token: ' + error.message);
    }
  }
}

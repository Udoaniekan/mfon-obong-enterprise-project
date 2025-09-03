import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { MaintenanceModeService } from '../../maintenance-mode/services/maintenance-mode.service';
import { UserRole } from '../../../common/enums';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private maintenanceModeService: MaintenanceModeService,
  ) {
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

      // Check maintenance mode before allowing login
      const maintenanceStatus = await this.maintenanceModeService.isMaintenanceMode();
      if (maintenanceStatus.isActive) {
        // Only allow SUPER_ADMIN and the MAINTAINER who activated it to login
        if (user.role !== UserRole.SUPER_ADMIN && 
            !(user.role === UserRole.MAINTAINER && maintenanceStatus.activatedBy === user._id?.toString())) {
          throw new ForbiddenException({
            message: 'System is currently in maintenance mode. Login is restricted to administrators only.',
            statusCode: 503,
            error: 'Service Unavailable - Maintenance Mode Active'
          });
        }
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
        branchId: user.branchId,
      };
    } catch (error) {
      console.error('Validation error:', error);
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException(error.message);
    }
  }
}

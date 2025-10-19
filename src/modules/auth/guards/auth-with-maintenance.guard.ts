import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MaintenanceModeService } from '../../maintenance-mode/services/maintenance-mode.service';
import { UserRole } from '../../../common/enums';

@Injectable()
export class AuthWithMaintenanceGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(private readonly maintenanceModeService: MaintenanceModeService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, check JWT authentication
    const isAuthenticated = await super.canActivate(context);
    if (!isAuthenticated) {
      return false;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Get current maintenance mode status
    const maintenanceStatus = await this.maintenanceModeService.isMaintenanceMode();

    // If maintenance mode is not active, allow access
    if (!maintenanceStatus.isActive) {
      return true;
    }

    // If maintenance mode is active, only allow MAINTAINER
    if (user.role === UserRole.MAINTAINER) {
      return true;
    }

    // Block all other users
    throw new ForbiddenException({
      message: 'System is currently in maintenance mode. Access is restricted to administrators only.',
      statusCode: 503,
      error: 'Service Unavailable - Maintenance Mode Active'
    });
  }
}
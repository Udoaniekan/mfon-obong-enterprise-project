import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { MaintenanceModeService } from '../../maintenance-mode/services/maintenance-mode.service';
import { UserRole } from '../../../common/enums';
import { BYPASS_MAINTENANCE_KEY } from '../../../decorators/bypass-maintenance.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(
    private readonly maintenanceModeService: MaintenanceModeService,
    private reflector: Reflector,
  ) {
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

    // Check if this endpoint bypasses maintenance mode
    const bypassMaintenance = this.reflector.getAllAndOverride<boolean>(BYPASS_MAINTENANCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (bypassMaintenance) {
      return true;
    }

    // Get current maintenance mode status
    const maintenanceStatus = await this.maintenanceModeService.isMaintenanceMode();

    // If maintenance mode is not active, allow access
    if (!maintenanceStatus.isActive) {
      return true;
    }

    // If maintenance mode is active, only allow SUPER_ADMIN and the MAINTAINER who activated it
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    if (user.role === UserRole.MAINTAINER && maintenanceStatus.activatedBy === user.userId) {
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

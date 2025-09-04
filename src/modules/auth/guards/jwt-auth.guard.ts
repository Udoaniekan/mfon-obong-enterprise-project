import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { SessionManagementService } from '../../session-management/services/session-management.service';
import { UserRole } from '../../../common/enums';
import { BYPASS_SESSION_MANAGEMENT_KEY } from '../../../decorators/bypass-session-management.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(
    private readonly sessionManagementService: SessionManagementService,
    private reflector: Reflector,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, check JWT authentication
    const isAuthenticated = await super.canActivate(context) as boolean;
    
    if (!isAuthenticated) {
      return false;
    }

    // Check if this endpoint bypasses session management (MUST BE FIRST!)
    const bypassSessionManagement = this.reflector.getAllAndOverride<boolean>(BYPASS_SESSION_MANAGEMENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (bypassSessionManagement) {
      console.log('Bypassing session management for this endpoint');
      return true;
    }

    // Then check session management (active hours) for API requests
    try {
      const request = context.switchToHttp().getRequest();
      const user = request.user;

      if (user) {
        const { isWithinHours, setting } = await this.sessionManagementService.isActiveHours();
        
        if (!isWithinHours && setting) {
          // SUPER_ADMIN is always exempted
          if (user.role === UserRole.SUPER_ADMIN) {
            return true;
          }

          // Any MAINTAINER is exempted from session hours
          if (user.role === UserRole.MAINTAINER) {
            return true;
          }

          // Block all other users
          console.log('Blocking user - outside active hours:', user.email);
          return false;
        }
      }
    } catch (error) {
      // If there's any error in checking, allow access (fail-open approach)
      console.error('Error in JwtAuthGuard session checking:', error);
    }
    
    return true;
  }
}

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { SessionManagementService } from '../../session-management/services/session-management.service';
import { UserRole } from '../../../common/enums';
import { BYPASS_SESSION_MANAGEMENT_KEY } from '../../../decorators/bypass-session-management.decorator';
import { IS_PUBLIC_KEY } from 'src/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly sessionManagementService: SessionManagementService,
    private reflector: Reflector,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // ✅ 1. If endpoint is @Public, skip all checks
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // ✅ 2. Perform normal JWT authentication
    const isAuthenticated = (await super.canActivate(context)) as boolean;
    if (!isAuthenticated) {
      return false;
    }

    // ✅ 3. Check if this endpoint bypasses session management
    const bypassSessionManagement = this.reflector.getAllAndOverride<boolean>(
      BYPASS_SESSION_MANAGEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (bypassSessionManagement) {
      return true;
    }

    // ✅ 4. Enforce session management (active hours)
    try {
      const request = context.switchToHttp().getRequest();
      const user = request.user;

      if (user) {
        const { isWithinHours, setting } =
          await this.sessionManagementService.isActiveHours();

        if (!isWithinHours && setting) {
          // SUPER_ADMIN is exempt
          if (user.role === UserRole.SUPER_ADMIN) {
            return true;
          }

          // MAINTAINER is exempt
          if (user.role === UserRole.MAINTAINER) {
            return true;
          }

          // Block all other users
          return false;
        }
      }
    } catch (error) {
      // Fail-open: if session check fails, allow access
      return true;
    }

    return true;
  }
}

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SessionManagementGuard } from '../../session-management/guards/session-management.guard';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(private readonly sessionManagementGuard: SessionManagementGuard) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, check JWT authentication
    const isAuthenticated = await super.canActivate(context) as boolean;
    
    if (!isAuthenticated) {
      return false;
    }

    // Then check session management (active hours)
    const isWithinActiveHours = await this.sessionManagementGuard.canActivate(context);
    
    return isWithinActiveHours;
  }
}

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from 'src/common/enums';
import { ROLES_KEY } from 'src/decorators/roles.decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    console.log('RolesGuard - Required roles:', requiredRoles);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    console.log('RolesGuard - User role:', user?.role);
    console.log('RolesGuard - User object:', user);
    
    const hasRole = requiredRoles.some((role) => user.role === role);
    console.log('RolesGuard - Has required role:', hasRole);
    
    return hasRole;
  }
}

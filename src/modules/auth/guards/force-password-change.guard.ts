import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const ALLOW_TEMPORARY_PASSWORD_KEY = 'allowTemporaryPassword';
export const AllowTemporaryPassword = () => SetMetadata(ALLOW_TEMPORARY_PASSWORD_KEY, true);

@Injectable()
export class ForcePasswordChangeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Check if this endpoint allows temporary password users
    const allowTemporaryPassword = this.reflector.getAllAndOverride<boolean>(
      ALLOW_TEMPORARY_PASSWORD_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowTemporaryPassword) {
      return true;
    }

    // If user has temporary password and must change it, block access to other endpoints
    if (user.mustChangePassword && user.isTemporaryPassword) {
      throw new ForbiddenException({
        message: 'You must change your temporary password before accessing other features. Please use the update password endpoint.',
        statusCode: 403,
        error: 'Password Change Required',
        mustChangePassword: true,
        temporaryPasswordExpiry: user.temporaryPasswordExpiry,
      });
    }

    return true;
  }
}
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionManagementService } from '../services/session-management.service';
import { UserRole } from '../../../common/enums';

@Injectable()
export class SessionManagementGuard implements CanActivate {
  constructor(
    private readonly sessionManagementService: SessionManagementService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest();
      const user = request.user;

      if (!user) {
        return false;
      }

      // Check if current time is within active hours
      const { isWithinHours, setting } = await this.sessionManagementService.isActiveHours();

      // If within active hours or no restrictions, allow access
      if (isWithinHours) {
        return true;
      }

      // If outside active hours, check for exemptions
      // SUPER_ADMIN is always exempted
      if (user.role === UserRole.SUPER_ADMIN) {
        return true;
      }

      // The MAINTAINER who set the active hours is exempted
      if (user.role === UserRole.MAINTAINER && setting) {
        if (user._id?.toString() === setting.setBy.toString()) {
          return true;
        }
      }

      // Block all other users with a detailed message
      const currentTime = new Date().toLocaleString('en-US', { 
        timeZone: setting?.timezone || 'UTC',
        hour12: true,
        hour: '2-digit',
        minute: '2-digit'
      });

      const activeHours = setting 
        ? `${setting.startTime} - ${setting.endTime} (${setting.timezone})`
        : 'Not configured';

      throw new ForbiddenException({
        message: `Access denied: You can only use the application during active hours (${activeHours}). Current time: ${currentTime}`,
        statusCode: 403,
        error: 'Outside Active Hours',
        activeHours: setting ? {
          startTime: setting.startTime,
          endTime: setting.endTime,
          timezone: setting.timezone,
        } : null,
        currentTime: currentTime,
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      
      // If there's any error in checking, allow access (fail-open approach)
      console.error('Error in SessionManagementGuard:', error);
      return true;
    }
  }
}
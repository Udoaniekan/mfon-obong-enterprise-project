import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ToggleMaintenanceModeDto } from '../dto/maintenance-mode.dto';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { AppWebSocketGateway } from '../../websocket/websocket.gateway';

@Injectable()
export class MaintenanceModeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemActivityLogService: SystemActivityLogService,
    private readonly websocketGateway: AppWebSocketGateway,
  ) {}

  private readonly maintenanceInclude = {
    activatedBy: { select: { id: true, name: true, email: true } },
    deactivatedBy: { select: { id: true, name: true, email: true } },
  };

  private toDoc(mode: any) {
    if (!mode) return mode;
    const { activatedBy, deactivatedBy, ...rest } = mode;
    return {
      ...rest,
      _id: mode.id,
      activatedBy: activatedBy ? { _id: activatedBy.id, ...activatedBy } : mode.activatedById,
      deactivatedBy: deactivatedBy ? { _id: deactivatedBy.id, ...deactivatedBy } : mode.deactivatedById,
    };
  }

  async getCurrentMode(): Promise<any | null> {
    const mode = await this.prisma.maintenanceMode.findFirst({
      orderBy: { activatedAt: 'desc' },
      include: this.maintenanceInclude,
    });
    return this.toDoc(mode);
  }

  async isMaintenanceMode(): Promise<{ isActive: boolean; activatedBy?: string }> {
    const mode = await this.getCurrentMode();
    if (!mode) return { isActive: false };
    return {
      isActive: mode.isActive,
      activatedBy: mode.isActive && mode.activatedById ? mode.activatedById : undefined,
    };
  }

  async toggleMaintenanceMode(
    toggleDto: ToggleMaintenanceModeDto,
    currentUser: any,
    device?: string,
  ): Promise<{ isActive: boolean; message: string }> {
    if (!currentUser) throw new Error('Invalid or missing currentUser in toggleMaintenanceMode');

    const currentMode = await this.getCurrentMode();
    const newState = !currentMode?.isActive || false;

    if (newState) {
      await this.prisma.maintenanceMode.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      await this.prisma.maintenanceMode.create({
        data: {
          isActive: true,
          activatedById: currentUser._id?.toString() || currentUser.id,
          reason: toggleDto.reason || 'Maintenance mode activated',
          activatedAt: new Date(),
        },
      });

      try {
        await this.systemActivityLogService.createLog({
          action: 'MAINTENANCE_MODE_ACTIVATED',
          details: `Maintenance mode activated by ${currentUser.name || currentUser.email}. Reason: ${toggleDto.reason || 'No reason provided'}`,
          performedBy: currentUser.email || currentUser.name || currentUser._id?.toString() || currentUser.id,
          role: currentUser.role,
          device: device || 'System',
        });
      } catch {}

      try {
        this.websocketGateway.server.emit('maintenance_mode_activated', {
          message: 'System is entering maintenance mode. Please save your work.',
          reason: toggleDto.reason || 'Maintenance mode activated',
          activatedBy: currentUser.name || currentUser.email,
          timestamp: new Date().toISOString(),
        });
      } catch (wsError) {
        console.error('Failed to emit maintenance mode WebSocket event:', wsError);
      }

      return { isActive: true, message: 'Maintenance mode activated. Only MAINTAINER can access the system.' };
    } else {
      const activeMode = await this.prisma.maintenanceMode.findFirst({
        where: { isActive: true },
        orderBy: { activatedAt: 'desc' },
      });

      if (activeMode) {
        await this.prisma.maintenanceMode.update({
          where: { id: activeMode.id },
          data: {
            isActive: false,
            deactivatedById: currentUser._id?.toString() || currentUser.id,
            deactivatedAt: new Date(),
            deactivationReason: toggleDto.reason || 'Maintenance mode deactivated',
          },
        });
      }

      try {
        await this.systemActivityLogService.createLog({
          action: 'MAINTENANCE_MODE_DEACTIVATED',
          details: `Maintenance mode deactivated by ${currentUser.name || currentUser.email}. Reason: ${toggleDto.reason || 'No reason provided'}`,
          performedBy: currentUser.email || currentUser.name || currentUser._id?.toString() || currentUser.id,
          role: currentUser.role,
          device: device || 'System',
        });
      } catch {}

      try {
        this.websocketGateway.server.emit('maintenance_mode_deactivated', {
          message: 'Maintenance mode has been deactivated. System access restored.',
          deactivatedBy: currentUser.name || currentUser.email,
          timestamp: new Date().toISOString(),
        });
      } catch (wsError) {
        console.error('Failed to emit maintenance mode deactivation WebSocket event:', wsError);
      }

      return { isActive: false, message: 'Maintenance mode deactivated. Normal system access restored.' };
    }
  }

  async getMaintenanceHistory(): Promise<any[]> {
    const modes = await this.prisma.maintenanceMode.findMany({
      orderBy: { createdAt: 'desc' },
      include: this.maintenanceInclude,
      take: 20,
    });
    return modes.map((m) => this.toDoc(m));
  }

  async notifyMaintainer(email: string, message?: string): Promise<string> {
    await this.prisma.notification.create({
      data: {
        userEmail: email,
        message: message || 'A user has requested support.',
      },
    });
    return `Notification sent to maintainer dashboard for email: ${email}`;
  }

  async getNotifications(): Promise<any[]> {
    const notifications = await this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return notifications.map((n) => ({ ...n, _id: n.id }));
  }

  async notifyBranchAdmin(email: string, branch: string, temporaryPassword: string): Promise<string> {
    if (!branch) throw new BadRequestException(`Invalid branch ID provided: ${branch}`);

    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user) {
      throw new NotFoundException(`User with email ${email} does not exist in the system.`);
    }

    await this.prisma.branchNotification.create({
      data: {
        branchId: branch,
        message: 'A temporary password has been generated for a user in your branch.',
        temporaryPassword,
        createdById: user.id,
      },
    });

    return `Notification sent to branch admin for branch: ${branch}`;
  }
}

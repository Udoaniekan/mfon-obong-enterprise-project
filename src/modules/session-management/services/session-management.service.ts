import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SetActiveHoursDto, UpdateActiveHoursDto, SessionStatusResponseDto } from '../dto/session-management.dto';
import { UserRole } from '../../../common/enums';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';

@Injectable()
export class SessionManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}

  async setActiveHours(
    setActiveHoursDto: SetActiveHoursDto,
    currentUser: any,
    device?: string,
  ): Promise<any> {
    if (currentUser.role !== UserRole.MAINTAINER) {
      throw new ForbiddenException('Only MAINTAINERs can set active hours');
    }
    this.validateTimeRange(setActiveHoursDto.startTime, setActiveHoursDto.endTime);

    await this.prisma.sessionManagement.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    const savedSetting = await this.prisma.sessionManagement.create({
      data: {
        startTime: setActiveHoursDto.startTime,
        endTime: setActiveHoursDto.endTime,
        timezone: setActiveHoursDto.timezone,
        setById: currentUser._id?.toString() || currentUser.id,
        setByEmail: currentUser.email,
        description: setActiveHoursDto.description,
        isActive: true,
      },
    });

    try {
      await this.systemActivityLogService.createLog({
        action: 'SESSION_HOURS_SET',
        details: `Active hours set: ${setActiveHoursDto.startTime} - ${setActiveHoursDto.endTime} (${setActiveHoursDto.timezone})`,
        performedBy: currentUser.email || currentUser.name || 'System',
        role: currentUser.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch {}

    return { ...savedSetting, _id: savedSetting.id };
  }

  async getActiveHours(): Promise<any | null> {
    const setting = await this.prisma.sessionManagement.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!setting) return null;
    return { ...setting, _id: setting.id, setBy: setting.setById };
  }

  async updateActiveHours(
    updateActiveHoursDto: UpdateActiveHoursDto,
    currentUser: any,
    device?: string,
  ): Promise<any> {
    if (currentUser.role !== UserRole.MAINTAINER) {
      throw new ForbiddenException('Only MAINTAINERs can update active hours');
    }

    const existingSetting = await this.prisma.sessionManagement.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!existingSetting) throw new NotFoundException('No active hours setting found');

    if (updateActiveHoursDto.startTime && updateActiveHoursDto.endTime) {
      this.validateTimeRange(updateActiveHoursDto.startTime, updateActiveHoursDto.endTime);
    }

    const updatedSetting = await this.prisma.sessionManagement.update({
      where: { id: existingSetting.id },
      data: {
        ...(updateActiveHoursDto.startTime && { startTime: updateActiveHoursDto.startTime }),
        ...(updateActiveHoursDto.endTime && { endTime: updateActiveHoursDto.endTime }),
        ...(updateActiveHoursDto.timezone && { timezone: updateActiveHoursDto.timezone }),
        ...(updateActiveHoursDto.description !== undefined && { description: updateActiveHoursDto.description }),
      },
    });

    try {
      await this.systemActivityLogService.createLog({
        action: 'SESSION_HOURS_UPDATED',
        details: `Active hours updated: ${updatedSetting.startTime} - ${updatedSetting.endTime} (${updatedSetting.timezone})`,
        performedBy: currentUser.email || currentUser.name || 'System',
        role: currentUser.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch {}

    return { ...updatedSetting, _id: updatedSetting.id, setBy: updatedSetting.setById };
  }

  async getSessionStatus(): Promise<SessionStatusResponseDto> {
    const activeHoursSetting = await this.getActiveHours();
    const currentTime = new Date();

    if (!activeHoursSetting) {
      return {
        isActiveHours: true,
        currentTime: currentTime.toISOString(),
        message: 'No active hours restrictions configured',
      };
    }

    const isWithinActiveHours = this.isCurrentTimeWithinActiveHours(activeHoursSetting);
    return {
      isActiveHours: isWithinActiveHours,
      currentTime: currentTime.toISOString(),
      activeHours: {
        startTime: activeHoursSetting.startTime,
        endTime: activeHoursSetting.endTime,
        timezone: activeHoursSetting.timezone,
        setBy: activeHoursSetting.setById,
        setByEmail: activeHoursSetting.setByEmail,
        description: activeHoursSetting.description,
      },
      message: isWithinActiveHours
        ? 'Currently within active hours'
        : 'Currently outside active hours - access restricted',
    };
  }

  async isActiveHours(): Promise<{ isWithinHours: boolean; setting?: any }> {
    const setting = await this.getActiveHours();
    if (!setting) return { isWithinHours: true };
    return {
      isWithinHours: this.isCurrentTimeWithinActiveHours(setting),
      setting,
    };
  }

  private isCurrentTimeWithinActiveHours(setting: any): boolean {
    try {
      const now = new Date();
      const currentTimeInTimezone = new Date(
        now.toLocaleString('en-US', { timeZone: setting.timezone }),
      );
      const currentHour = currentTimeInTimezone.getHours();
      const currentMinute = currentTimeInTimezone.getMinutes();
      const currentTimeInMinutes = currentHour * 60 + currentMinute;

      const [startHour, startMinute] = setting.startTime.split(':').map(Number);
      const [endHour, endMinute] = setting.endTime.split(':').map(Number);
      const startTimeInMinutes = startHour * 60 + startMinute;
      const endTimeInMinutes = endHour * 60 + endMinute;

      if (endTimeInMinutes <= startTimeInMinutes) {
        return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes;
      } else {
        return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
      }
    } catch {
      return true;
    }
  }

  private validateTimeRange(startTime: string, endTime: string): void {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime)) {
      throw new BadRequestException('Invalid startTime format. Use HH:mm (24-hour)');
    }
    if (!timeRegex.test(endTime)) {
      throw new BadRequestException('Invalid endTime format. Use HH:mm (24-hour)');
    }
  }

  async deactivateActiveHours(currentUser: any, device?: string): Promise<{ message: string }> {
    if (currentUser.role !== UserRole.MAINTAINER) {
      throw new ForbiddenException('Only MAINTAINERs can deactivate active hours');
    }

    const result = await this.prisma.sessionManagement.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    try {
      await this.systemActivityLogService.createLog({
        action: 'SESSION_HOURS_DEACTIVATED',
        details: 'Active hours restrictions have been deactivated',
        performedBy: currentUser.email || currentUser.name || 'System',
        role: currentUser.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch {}

    return {
      message:
        result.count > 0
          ? 'Active hours have been deactivated successfully'
          : 'No active hours were found to deactivate',
    };
  }

  async getActiveHoursHistory(): Promise<any[]> {
    const settings = await this.prisma.sessionManagement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return settings.map((s) => ({ ...s, _id: s.id, setBy: s.setById }));
  }
}

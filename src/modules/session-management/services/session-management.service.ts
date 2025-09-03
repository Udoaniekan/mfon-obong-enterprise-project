import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SessionManagement, SessionManagementDocument } from '../schemas/session-management.schema';
import { SetActiveHoursDto, UpdateActiveHoursDto, SessionStatusResponseDto } from '../dto/session-management.dto';
import { UserDocument } from '../../users/schemas/user.schema';
import { UserRole } from '../../../common/enums';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';

@Injectable()
export class SessionManagementService {
  constructor(
    @InjectModel(SessionManagement.name) 
    private sessionManagementModel: Model<SessionManagementDocument>,
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}

  async setActiveHours(
    setActiveHoursDto: SetActiveHoursDto,
    currentUser: UserDocument,
    device?: string,
  ): Promise<SessionManagementDocument> {
    // Only MAINTAINER can set active hours
    if (currentUser.role !== UserRole.MAINTAINER) {
      throw new ForbiddenException('Only MAINTAINERs can set active hours');
    }

    // Validate time format and logic
    this.validateTimeRange(setActiveHoursDto.startTime, setActiveHoursDto.endTime);

    // Deactivate any existing active hours settings
    await this.sessionManagementModel.updateMany(
      { isActive: true },
      { isActive: false }
    );

    // Create new active hours setting
    const sessionManagement = new this.sessionManagementModel({
      ...setActiveHoursDto,
      setBy: new Types.ObjectId(currentUser._id?.toString()),
      setByEmail: currentUser.email,
      isActive: true,
    });

    const savedSetting = await sessionManagement.save();

    // Log the activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'SESSION_HOURS_SET',
        details: `Active hours set: ${setActiveHoursDto.startTime} - ${setActiveHoursDto.endTime} (${setActiveHoursDto.timezone})`,
        performedBy: currentUser.email || currentUser.name || 'System',
        role: currentUser.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch (logError) {
      // Don't fail if logging fails
    }

    return savedSetting;
  }

  async getActiveHours(): Promise<SessionManagementDocument | null> {
    return this.sessionManagementModel
      .findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .exec();
  }

  async updateActiveHours(
    updateActiveHoursDto: UpdateActiveHoursDto,
    currentUser: UserDocument,
    device?: string,
  ): Promise<SessionManagementDocument> {
    // Only MAINTAINER can update active hours
    if (currentUser.role !== UserRole.MAINTAINER) {
      throw new ForbiddenException('Only MAINTAINERs can update active hours');
    }

    const existingSetting = await this.getActiveHours();
    if (!existingSetting) {
      throw new NotFoundException('No active hours setting found');
    }

    // Validate time range if both times are provided
    if (updateActiveHoursDto.startTime && updateActiveHoursDto.endTime) {
      this.validateTimeRange(updateActiveHoursDto.startTime, updateActiveHoursDto.endTime);
    }

    // Update the setting
    Object.assign(existingSetting, updateActiveHoursDto);
    const updatedSetting = await existingSetting.save();

    // Log the activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'SESSION_HOURS_UPDATED',
        details: `Active hours updated: ${updatedSetting.startTime} - ${updatedSetting.endTime} (${updatedSetting.timezone})`,
        performedBy: currentUser.email || currentUser.name || 'System',
        role: currentUser.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch (logError) {
      // Don't fail if logging fails
    }

    return updatedSetting;
  }

  async getSessionStatus(): Promise<SessionStatusResponseDto> {
    const activeHoursSetting = await this.getActiveHours();
    const currentTime = new Date();

    if (!activeHoursSetting) {
      return {
        isActiveHours: true, // No restrictions if no setting exists
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
        setBy: activeHoursSetting.setBy.toString(),
        setByEmail: activeHoursSetting.setByEmail,
        description: activeHoursSetting.description,
      },
      message: isWithinActiveHours 
        ? 'Currently within active hours' 
        : 'Currently outside active hours - access restricted',
    };
  }

  async isActiveHours(): Promise<{ isWithinHours: boolean; setting?: SessionManagementDocument }> {
    const setting = await this.getActiveHours();
    
    if (!setting) {
      return { isWithinHours: true }; // No restrictions if no setting
    }

    return {
      isWithinHours: this.isCurrentTimeWithinActiveHours(setting),
      setting,
    };
  }

  private isCurrentTimeWithinActiveHours(setting: SessionManagementDocument): boolean {
    try {
      const now = new Date();
      
      // Convert current time to the configured timezone
      const currentTimeInTimezone = new Date(now.toLocaleString('en-US', { 
        timeZone: setting.timezone 
      }));

      // Get current hour and minute
      const currentHour = currentTimeInTimezone.getHours();
      const currentMinute = currentTimeInTimezone.getMinutes();
      const currentTimeInMinutes = currentHour * 60 + currentMinute;

      // Parse start and end times
      const [startHour, startMinute] = setting.startTime.split(':').map(Number);
      const [endHour, endMinute] = setting.endTime.split(':').map(Number);
      
      const startTimeInMinutes = startHour * 60 + startMinute;
      const endTimeInMinutes = endHour * 60 + endMinute;

      // Handle cases where end time is next day (e.g., 22:00 - 06:00)
      if (endTimeInMinutes <= startTimeInMinutes) {
        // Spans midnight
        return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes <= endTimeInMinutes;
      } else {
        // Same day
        return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
      }
    } catch (error) {
      console.error('Error checking active hours:', error);
      return true; // Default to allowing access if there's an error
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

    // Additional validation can be added here if needed
    // For now, we allow overnight ranges (e.g., 22:00 - 06:00)
  }

  async deactivateActiveHours(
    currentUser: UserDocument,
    device?: string,
  ): Promise<{ message: string }> {
    // Only MAINTAINER can deactivate active hours
    if (currentUser.role !== UserRole.MAINTAINER) {
      throw new ForbiddenException('Only MAINTAINERs can deactivate active hours');
    }

    const result = await this.sessionManagementModel.updateMany(
      { isActive: true },
      { isActive: false }
    );

    // Log the activity
    try {
      await this.systemActivityLogService.createLog({
        action: 'SESSION_HOURS_DEACTIVATED',
        details: 'Active hours restrictions have been deactivated',
        performedBy: currentUser.email || currentUser.name || 'System',
        role: currentUser.role || 'SYSTEM',
        device: device || 'System',
      });
    } catch (logError) {
      // Don't fail if logging fails
    }

    return {
      message: result.modifiedCount > 0 
        ? 'Active hours have been deactivated successfully' 
        : 'No active hours were found to deactivate',
    };
  }

  async getActiveHoursHistory(): Promise<SessionManagementDocument[]> {
    return this.sessionManagementModel
      .find()
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();
  }
}
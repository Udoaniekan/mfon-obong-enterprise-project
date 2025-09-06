import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MaintenanceMode, MaintenanceModeDocument } from '../schemas/maintenance-mode.schema';
import { ToggleMaintenanceModeDto } from '../dto/maintenance-mode.dto';
import { UserDocument } from '../../users/schemas/user.schema';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { extractDeviceInfo } from '../../system-activity-logs/utils/device-extractor.util';

@Injectable()
export class MaintenanceModeService {
  constructor(
    @InjectModel(MaintenanceMode.name)
    private readonly maintenanceModeModel: Model<MaintenanceModeDocument>,
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}

  async getCurrentMode(): Promise<MaintenanceModeDocument | null> {
    // Get the most recent maintenance mode record
    const mode = await this.maintenanceModeModel
      .findOne()
      .sort({ createdAt: -1 })
      .populate('activatedBy', 'name email')
      .populate('deactivatedBy', 'name email')
      .exec();
    
    return mode;
  }

  async isMaintenanceMode(): Promise<{ isActive: boolean; activatedBy?: string }> {
    const mode = await this.getCurrentMode();
    
    if (!mode) {
      return { isActive: false };
    }

    return {
      isActive: mode.isActive,
      activatedBy: mode.isActive && mode.activatedBy ? mode.activatedBy.toString() : undefined
    };
  }

  async toggleMaintenanceMode(
    toggleDto: ToggleMaintenanceModeDto,
    currentUser: UserDocument,
    device?: string,
  ): Promise<{ isActive: boolean; message: string }> {
    const currentMode = await this.getCurrentMode();
    const newState = !currentMode?.isActive || false;

    if (newState) {
      // Activating maintenance mode
      const newMode = new this.maintenanceModeModel({
        isActive: true,
        activatedBy: new Types.ObjectId(currentUser._id?.toString()),
        reason: toggleDto.reason || 'Maintenance mode activated',
        activatedAt: new Date(),
      });

      await newMode.save();

      // Log activation
      try {
        await this.systemActivityLogService.createLog({
          action: 'MAINTENANCE_MODE_ACTIVATED',
          details: `Maintenance mode activated by ${currentUser.name || currentUser.email}. Reason: ${toggleDto.reason || 'No reason provided'}`,
          performedBy: currentUser.email || currentUser.name || currentUser._id.toString(),
          role: currentUser.role,
          device: device || 'System',
        });
      } catch (logError) {
        console.error('Failed to log maintenance mode activation:', logError);
      }

      return {
        isActive: true,
        message: 'Maintenance mode activated. Only MAINTAINER and SUPER_ADMIN can access the system.'
      };
    } else {
      // Deactivating maintenance mode
      if (currentMode) {
        currentMode.isActive = false;
        currentMode.deactivatedBy = new Types.ObjectId(currentUser._id?.toString());
        currentMode.deactivatedAt = new Date();
        currentMode.deactivationReason = toggleDto.reason || 'Maintenance mode deactivated';
        await currentMode.save();
      }

      // Log deactivation
      try {
        await this.systemActivityLogService.createLog({
          action: 'MAINTENANCE_MODE_DEACTIVATED',
          details: `Maintenance mode deactivated by ${currentUser.name || currentUser.email}. Reason: ${toggleDto.reason || 'No reason provided'}`,
          performedBy: currentUser.email || currentUser.name || currentUser._id.toString(),
          role: currentUser.role,
          device: device || 'System',
        });
      } catch (logError) {
        console.error('Failed to log maintenance mode deactivation:', logError);
      }

      return {
        isActive: false,
        message: 'Maintenance mode deactivated. Normal system access restored.'
      };
    }
  }

  async getMaintenanceHistory(): Promise<MaintenanceModeDocument[]> {
    return this.maintenanceModeModel
      .find()
      .sort({ createdAt: -1 })
      .populate('activatedBy', 'name email')
      .populate('deactivatedBy', 'name email')
      .limit(20) // Last 20 maintenance mode changes
      .exec();
  }
}
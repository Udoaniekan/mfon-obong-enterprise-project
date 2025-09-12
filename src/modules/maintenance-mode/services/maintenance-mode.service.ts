import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MaintenanceMode, MaintenanceModeDocument } from '../schemas/maintenance-mode.schema';
import { ToggleMaintenanceModeDto } from '../dto/maintenance-mode.dto';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { extractDeviceInfo } from '../../system-activity-logs/utils/device-extractor.util';
import { Notification, NotificationDocument } from '../schemas/notification.schema';
import { BranchNotification, BranchNotificationDocument } from '../../notifications/schemas/branch-notification.schema';

@Injectable()
export class MaintenanceModeService {
  constructor(
    @InjectModel(MaintenanceMode.name)
    private readonly maintenanceModeModel: Model<MaintenanceModeDocument>,
    private readonly systemActivityLogService: SystemActivityLogService,
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(BranchNotification.name) private branchNotificationModel: Model<BranchNotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
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

  async notifyMaintainer(email: string, message?: string): Promise<string> {
    const notification = new this.notificationModel({
      userEmail: email,
      message: message || 'A user has requested support.',
    });
    await notification.save();

    return `Notification sent to maintainer dashboard for email: ${email}`;
  }

  async getNotifications(): Promise<Notification[]> {
    return this.notificationModel.find().sort({ createdAt: -1 }).exec();
  }

  async notifyBranchAdmin(email: string, branch: string, temporaryPassword: string): Promise<string> {
    try {
      // Validate the branch ID
      if (!Types.ObjectId.isValid(branch)) {
        throw new BadRequestException(`Invalid branch ID provided: ${branch}`);
      }

      // Fetch the user by email to get their ObjectId
      const user = await this.userModel.findOne({ email }).exec();
      if (!user) {
        throw new NotFoundException(`User with email ${email} does not exist in the system. Please verify the email address.`);
      }

      const notification = new this.branchNotificationModel({
        branch: new Types.ObjectId(branch),
        message: `A temporary password has been generated for a user in your branch.`,
        temporaryPassword: temporaryPassword,
        createdBy: user._id, // Use the user's ObjectId
      });
      await notification.save();

      return `Notification sent to branch admin for branch: ${branch}`;
    } catch (error) {
      throw error;
    }
  }
}
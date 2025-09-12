import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BranchNotification, BranchNotificationDocument } from '../schemas/branch-notification.schema';
import { Types } from 'mongoose';

@Injectable()
export class BranchNotificationService {
  constructor(
    @InjectModel(BranchNotification.name)
    private readonly branchNotificationModel: Model<BranchNotificationDocument>,
  ) {}

  async getAllByBranch(branchId: string) {
  if (!branchId) {
    throw new Error('Branch ID is required');
  }

  const notifications = await this.branchNotificationModel.find({
    branch: new Types.ObjectId(branchId),
  }).exec();

  if (!notifications || notifications.length === 0) {
    throw new NotFoundException('No notifications found for the specified branch');
  }

  return notifications;
}
  async getById(id: string) {
    return this.branchNotificationModel.findById(id).exec();
  }

  async deleteById(id: string) {
    const notification = await this.getById(id);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return this.branchNotificationModel.findByIdAndDelete(id).exec();
  }
}

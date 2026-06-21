import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class BranchNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllByBranch(branchId: string) {
    if (!branchId) throw new Error('Branch ID is required');

    const notifications = await this.prisma.branchNotification.findMany({
      where: { branchId },
      include: {
        branchRef: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!notifications || notifications.length === 0) {
      throw new NotFoundException('No notifications found for the specified branch');
    }

    return notifications.map((n) => ({ ...n, _id: n.id }));
  }

  async getById(id: string) {
    const notification = await this.prisma.branchNotification.findUnique({
      where: { id },
      include: {
        branchRef: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!notification) return null;
    return { ...notification, _id: notification.id };
  }

  async deleteById(id: string) {
    const notification = await this.getById(id);
    if (!notification) throw new NotFoundException('Notification not found');
    await this.prisma.branchNotification.delete({ where: { id } });
    return notification;
  }
}

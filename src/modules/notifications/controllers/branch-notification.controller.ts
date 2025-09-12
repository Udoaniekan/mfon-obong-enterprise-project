import { Controller, Get, Param, Delete, Req, ForbiddenException, NotFoundException, BadRequestException, UseGuards, Request } from '@nestjs/common';
import { BranchNotificationService } from '../services/branch-notification.service';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorators';
import { UserRole } from 'src/common/enums';

@Controller('branch-notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchNotificationController {
  constructor(private readonly branchNotificationService: BranchNotificationService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  async getAllNotifications(@Req() req: Request & { user: { branchId?: string } }) {
    if (!req.user || !req.user.branchId) {
      throw new BadRequestException('Branch ID is missing from the authenticated user payload');
    }

    const adminBranch = req.user.branchId; // Use branchId instead of branch
    return this.branchNotificationService.getAllByBranch(adminBranch);
  }

  @Get(':id')
  async getNotificationById(@Param('id') id: string, @Req() req: Request & { user: { branchId: string } }) {
    const adminBranch = req.user.branchId;
    const notification = await this.branchNotificationService.getById(id);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.branch.toString() !== adminBranch.toString()) {
      throw new ForbiddenException('You do not have access to this notification');
    }

    return notification;
  }

  @Get('get')
  async getUser(@Request() req) {
    return req.user;
  }

  @Delete(':id')
  async deleteNotification(@Param('id') id: string, @Req() req: Request & { user: { branchId: string } }) {
    const adminBranch = req.user.branchId;
    const notification = await this.branchNotificationService.getById(id);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.branch.toString() !== adminBranch.toString()) {
      throw new ForbiddenException('You do not have access to delete this notification');
    }

    return this.branchNotificationService.deleteById(id);
  }

  @Get('test')
  async testRoute() {
    return { message: 'Test route is working' };
  }

 
}

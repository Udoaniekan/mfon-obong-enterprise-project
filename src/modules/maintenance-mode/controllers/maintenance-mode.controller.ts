import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { MaintenanceModeService } from '../services/maintenance-mode.service';
import { ToggleMaintenanceModeDto } from '../dto/maintenance-mode.dto';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../../decorators/roles.decorators';
import { UserRole } from '../../../common/enums';
import { extractDeviceInfo } from '../../system-activity-logs/utils/device-extractor.util';
import { BypassMaintenance } from '../../../decorators/bypass-maintenance.decorator';
import { UsersService } from '../../users/services/users.service';

@Controller('maintenance-mode')
@BypassMaintenance()
export class MaintenanceModeController {
  constructor(
    private readonly maintenanceModeService: MaintenanceModeService,
    private readonly usersService: UsersService, // Inject UsersService
  ) {}

  @Get()
  @Roles(UserRole.MAINTAINER)
  async getCurrentMode() {
    return this.maintenanceModeService.getCurrentMode();
  }

  @Get('/status')
  @Roles(UserRole.MAINTAINER)
  async getStatus() {
    return this.maintenanceModeService.isMaintenanceMode();
  }

  @Post('/toggle')
  @Roles(UserRole.MAINTAINER)
  async toggleMaintenanceMode(
    @Body() toggleDto: ToggleMaintenanceModeDto,
    @Request() req,
  ) {
    const device = extractDeviceInfo(req.headers['user-agent'] || '');
    return this.maintenanceModeService.toggleMaintenanceMode(
      toggleDto,
      req.user,
      device,
    );
  }

  @Get('/history')
  @Roles(UserRole.MAINTAINER)
  async getMaintenanceHistory() {
    return this.maintenanceModeService.getMaintenanceHistory();
  }

  @Post('/contact-support')
  async contactSupport(
    @Body() body: { email: string; message: string },
  ) {
    // Validate email and message
    if (!body.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
      throw new BadRequestException('Invalid email address');
    }
    if (!body.message || body.message.trim().length === 0) {
      throw new BadRequestException('Message cannot be empty');
    }

    // Check if email exists in the database
    const user = await this.usersService.findByEmail(body.email);
    if (!user) {
      throw new BadRequestException('Email not registered');
    }

    // Notify maintainers
    return this.maintenanceModeService.notifyMaintainer(body.email, body.message);
  }

  @Get('/notifications')
  @Roles(UserRole.MAINTAINER)
  async getNotifications() {
    return this.maintenanceModeService.getNotifications();
  }
}
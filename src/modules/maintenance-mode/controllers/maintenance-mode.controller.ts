import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MaintenanceModeService } from '../services/maintenance-mode.service';
import { ToggleMaintenanceModeDto } from '../dto/maintenance-mode.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../../decorators/roles.decorators';
import { UserRole } from '../../../common/enums';
import { extractDeviceInfo } from '../../system-activity-logs/utils/device-extractor.util';
import { BypassMaintenance } from '../../../decorators/bypass-maintenance.decorator';

@Controller('maintenance-mode')
@UseGuards(JwtAuthGuard, RolesGuard)
@BypassMaintenance()
export class MaintenanceModeController {
  constructor(private readonly maintenanceModeService: MaintenanceModeService) {}

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
}
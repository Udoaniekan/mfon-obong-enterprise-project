import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SessionManagementService } from '../services/session-management.service';
import { SetActiveHoursDto, UpdateActiveHoursDto } from '../dto/session-management.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../../common/enums';
import { Roles } from '../../../decorators/roles.decorators';
import { BypassSessionManagement } from '../../../decorators/bypass-session-management.decorator';
import { extractDeviceInfo } from '../../system-activity-logs/utils/device-extractor.util';

@Controller('session-management')
@UseGuards(JwtAuthGuard, RolesGuard)
@BypassSessionManagement()
export class SessionManagementController {
  constructor(
    private readonly sessionManagementService: SessionManagementService,
  ) {}

  @Post('active-hours')
  @Roles(UserRole.MAINTAINER)
  async setActiveHours(
    @Body() setActiveHoursDto: SetActiveHoursDto,
    @Request() req,
  ) {
    const device = extractDeviceInfo(req.get('user-agent'));
    return this.sessionManagementService.setActiveHours(
      setActiveHoursDto,
      req.user,
      device,
    );
  }

  @Get('active-hours')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async getActiveHours() {
    return this.sessionManagementService.getActiveHours();
  }

  @Put('active-hours')
  @Roles(UserRole.MAINTAINER)
  async updateActiveHours(
    @Body() updateActiveHoursDto: UpdateActiveHoursDto,
    @Request() req,
  ) {
    const device = extractDeviceInfo(req.get('user-agent'));
    return this.sessionManagementService.updateActiveHours(
      updateActiveHoursDto,
      req.user,
      device,
    );
  }

  @Delete('active-hours')
  @Roles(UserRole.MAINTAINER)
  async deactivateActiveHours(@Request() req) {
    const device = extractDeviceInfo(req.get('user-agent'));
    return this.sessionManagementService.deactivateActiveHours(req.user, device);
  }

  @Get('status')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER, UserRole.ADMIN, UserRole.STAFF)
  async getSessionStatus() {
    return this.sessionManagementService.getSessionStatus();
  }

  @Get('history')
  @Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
  async getActiveHoursHistory() {
    return this.sessionManagementService.getActiveHoursHistory();
  }
}
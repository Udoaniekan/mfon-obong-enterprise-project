import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { SystemActivityLogService } from '../services/system-activity-log.service';
import { SystemActivityLog } from '../schemas/system-activity-log.schema';
import { CreateSystemActivityLogDto } from '../dto/system-activity-log.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../../decorators/roles.decorators';
import { UserRole } from '../../../common/enums';

@Controller('system-activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemActivityLogController {
  constructor(
    private readonly systemActivityLogService: SystemActivityLogService,
  ) {}

  @Post()
  @Roles(UserRole.MAINTAINER, UserRole.SUPER_ADMIN)
  async createLog(
    @Body() createSystemActivityLogDto: CreateSystemActivityLogDto,
  ): Promise<SystemActivityLog> {
    return this.systemActivityLogService.createLog(createSystemActivityLogDto);
  }

 @Get()
@Roles(UserRole.MAINTAINER, UserRole.SUPER_ADMIN, UserRole.ADMIN)
async getAllLogs(): Promise<SystemActivityLog[]> {
  return this.systemActivityLogService.getLogs();
}
}

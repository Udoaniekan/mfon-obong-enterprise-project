import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SystemActivityLogService } from '../services/system-activity-log.service';
import { SystemActivityLog } from '../schemas/system-activity-log.schema';
import { CreateSystemActivityLogDto } from '../dto/system-activity-log.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('system-activity-logs')
@UseGuards(JwtAuthGuard)
export class SystemActivityLogController {
  constructor(private readonly systemActivityLogService: SystemActivityLogService) {}

  @Post()
  async createLog(@Body() createSystemActivityLogDto: CreateSystemActivityLogDto): Promise<SystemActivityLog> {
    return this.systemActivityLogService.createLog(createSystemActivityLogDto);
  }

  @Get()
  async getAllLogs(): Promise<SystemActivityLog[]> {
    return this.systemActivityLogService.getLogs();
  }
}
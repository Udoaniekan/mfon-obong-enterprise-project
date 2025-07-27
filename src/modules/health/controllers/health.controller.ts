import { Controller, Get, UseGuards } from '@nestjs/common';
import { HealthService, HealthStatus } from '../services/health.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../../decorators/roles.decorators';
import { UserRole } from '../../../common/enums';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getBasicHealth(): Promise<{ status: string; timestamp: string }> {
    const health = await this.healthService.checkHealth();
    return {
      status: health.status,
      timestamp: health.timestamp,
    };
  }

  @Get('detailed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MAINTAINER, UserRole.SUPER_ADMIN)
  async getDetailedHealth(): Promise<HealthStatus> {
    return this.healthService.checkHealth();
  }
}

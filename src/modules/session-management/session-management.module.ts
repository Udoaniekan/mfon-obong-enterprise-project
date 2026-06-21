import { Module } from '@nestjs/common';
import { SessionManagementController } from './controllers/session-management.controller';
import { SessionManagementService } from './services/session-management.service';
import { SessionManagementGuard } from './guards/session-management.guard';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';

@Module({
  imports: [SystemActivityLogModule],
  controllers: [SessionManagementController],
  providers: [SessionManagementService, SessionManagementGuard],
  exports: [SessionManagementService, SessionManagementGuard],
})
export class SessionManagementModule {}

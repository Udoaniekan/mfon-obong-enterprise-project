import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionManagementController } from './controllers/session-management.controller';
import { SessionManagementService } from './services/session-management.service';
import { SessionManagement, SessionManagementSchema } from './schemas/session-management.schema';
import { SessionManagementGuard } from './guards/session-management.guard';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SessionManagement.name, schema: SessionManagementSchema },
    ]),
    SystemActivityLogModule,
  ],
  controllers: [SessionManagementController],
  providers: [SessionManagementService, SessionManagementGuard],
  exports: [SessionManagementService, SessionManagementGuard],
})
export class SessionManagementModule {}
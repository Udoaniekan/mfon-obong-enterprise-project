import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MaintenanceModeController } from './controllers/maintenance-mode.controller';
import { MaintenanceModeService } from './services/maintenance-mode.service';
import { MaintenanceMode, MaintenanceModeSchema } from './schemas/maintenance-mode.schema';
import { MaintenanceModeGuard } from './guards/maintenance-mode.guard';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { UsersModule } from '../users/users.module';
import { BranchNotification, BranchNotificationSchema } from '../notifications/schemas/branch-notification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MaintenanceMode.name, schema: MaintenanceModeSchema },
    ]),
    MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }]),
    MongooseModule.forFeature([{ name: BranchNotification.name, schema: BranchNotificationSchema }]),
    SystemActivityLogModule,
    UsersModule,
  ],
  controllers: [MaintenanceModeController],
  providers: [MaintenanceModeService, MaintenanceModeGuard],
  exports: [MaintenanceModeService, MaintenanceModeGuard],
})
export class MaintenanceModeModule {}
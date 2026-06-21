import { Module } from '@nestjs/common';
import { BranchNotificationController } from './controllers/branch-notification.controller';
import { BranchNotificationService } from './services/branch-notification.service';

@Module({
  controllers: [BranchNotificationController],
  providers: [BranchNotificationService],
  exports: [BranchNotificationService],
})
export class NotificationsModule {}

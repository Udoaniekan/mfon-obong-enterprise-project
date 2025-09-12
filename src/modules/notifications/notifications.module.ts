import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BranchNotification, BranchNotificationSchema } from './schemas/branch-notification.schema';
import { BranchNotificationController } from './controllers/branch-notification.controller';
import { BranchNotificationService } from './services/branch-notification.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: BranchNotification.name, schema: BranchNotificationSchema }]),
  ],
  controllers: [BranchNotificationController],
  providers: [BranchNotificationService],
  exports: [BranchNotificationService],
})
export class NotificationsModule {}
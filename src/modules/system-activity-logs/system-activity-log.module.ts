import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemActivityLog, SystemActivityLogSchema } from './schemas/system-activity-log.schema';
import { SystemActivityLogService } from './services/system-activity-log.service';
import { SystemActivityLogController } from './controllers/system-activity-log.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SystemActivityLog.name, schema: SystemActivityLogSchema },
    ]),
  ],
  controllers: [SystemActivityLogController],
  providers: [SystemActivityLogService],
  exports: [SystemActivityLogService],
})
export class SystemActivityLogModule {}
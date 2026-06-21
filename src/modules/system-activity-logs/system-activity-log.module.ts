import { Module } from '@nestjs/common';
import { SystemActivityLogService } from './services/system-activity-log.service';
import { SystemActivityLogController } from './controllers/system-activity-log.controller';

@Module({
  controllers: [SystemActivityLogController],
  providers: [SystemActivityLogService],
  exports: [SystemActivityLogService],
})
export class SystemActivityLogModule {}

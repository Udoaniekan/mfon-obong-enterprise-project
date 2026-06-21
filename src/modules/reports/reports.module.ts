import { Module } from '@nestjs/common';
import { ReportsService } from './services/reports.service';
import { ReportsController } from './controllers/reports.controller';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';

@Module({
  imports: [SystemActivityLogModule],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}

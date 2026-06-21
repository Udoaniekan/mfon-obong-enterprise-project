import { Module } from '@nestjs/common';
import { BranchesService } from './services/branches.service';
import { BranchesController } from './controllers/branches.controller';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';

@Module({
  imports: [SystemActivityLogModule],
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}

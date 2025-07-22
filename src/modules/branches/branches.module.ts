import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Branch, BranchSchema } from './schemas/branch.schema';
import { BranchesService } from './services/branches.service';
import { BranchesController } from './controllers/branches.controller';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Branch.name, schema: BranchSchema }]),
    SystemActivityLogModule,
  ],
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}

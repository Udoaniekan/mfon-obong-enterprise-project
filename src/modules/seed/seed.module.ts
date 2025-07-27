import { Module } from '@nestjs/common';
import { CommandModule } from 'nestjs-command';
import { SeedService } from './services/seed.service';
import { UsersModule } from '../users/users.module';
import { CategoriesModule } from '../categories/categories.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [CommandModule, UsersModule, CategoriesModule, BranchesModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}

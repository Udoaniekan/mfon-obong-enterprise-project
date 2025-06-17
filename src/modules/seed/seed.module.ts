import { Module } from '@nestjs/common';
import { CommandModule } from 'nestjs-command';
import { SeedService } from './services/seed.service';
import { UsersModule } from '../users/users.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    CommandModule,
    UsersModule,
    CategoriesModule,
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}

import { Module } from '@nestjs/common';
import { CommandModule } from 'nestjs-command';
import { SeedService } from './services/seed.service';
import { UsersModule } from '../users/users.module';
import { ProductsModule } from '../products/products.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    CommandModule,
    UsersModule,
    ProductsModule,
    ClientsModule,
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}

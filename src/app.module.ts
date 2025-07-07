import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
// import configuration from './config/configuration'; 
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { SeedModule } from './modules/seed/seed.module';
import { ReportsModule } from './modules/reports/reports.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BranchesModule } from './modules/branches/branches.module';
import { databaseConfig, jwtConfig } from './config/configuration';
// ... your other imports

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig], // Restored
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'), // Also updated to match your config structure
      }),
      inject: [ConfigService],
    }), 
    UsersModule,
    AuthModule,
    BranchesModule,
    CategoriesModule,
    ProductsModule,
    ClientsModule,
    TransactionsModule,
    ReportsModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
// import configuration from './config/configuration';
import { AppService } from './app.service';
import { AppController } from './app.controller';
import { CommonModule } from './common/common.module';
import { SeedModule } from './modules/seed/seed.module';
import { ReportsModule } from './modules/reports/reports.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BranchesModule } from './modules/branches/branches.module';
import { SystemActivityLogModule } from './modules/system-activity-logs/system-activity-log.module';
import { MaintenanceModeModule } from './modules/maintenance-mode/maintenance-mode.module';
import { SessionManagementModule } from './modules/session-management/session-management.module';
import { ColumnSettingsModule } from './modules/column-settings/column-settings.module';
import { HealthModule } from './modules/health/health.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { databaseConfig, jwtConfig } from './config/configuration';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SimpleSanitizationMiddleware } from './common/middleware/simple-sanitization.middleware';
import { SimpleRateLimitMiddleware } from './common/middleware/simple-rate-limit.middleware';
// ... your other imports

@Module({
  imports: [
    CommonModule,
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
    SystemActivityLogModule,
    MaintenanceModeModule,
    SessionManagementModule,
    ColumnSettingsModule,
    HealthModule,
    WebSocketModule,
    NotificationsModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply rate limiting to all routes
    consumer
      .apply(SimpleRateLimitMiddleware)
      .forRoutes('*');
    
    // Apply input sanitization to all routes except file uploads
    consumer
      .apply(SimpleSanitizationMiddleware)
      .exclude(
        { path: '/api/upload', method: RequestMethod.POST },
        { path: '/api/files', method: RequestMethod.POST }
      )
      .forRoutes('*');
  }
}

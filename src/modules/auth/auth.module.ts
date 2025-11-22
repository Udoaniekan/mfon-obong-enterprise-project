import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Otp, OtpSchema } from './schemas/otp.schema';
import { RefreshToken, RefreshTokenSchema } from './schemas/refresh-token.schema';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';
import { MaintenanceModeModule } from '../maintenance-mode/maintenance-mode.module';
import { SessionManagementService } from '../session-management/services/session-management.service';
// MongooseModule alias removed - using main MongooseModule import
import { SessionManagement, SessionManagementSchema } from '../session-management/schemas/session-management.schema';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    SystemActivityLogModule,
    MaintenanceModeModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_SECRET') || 'your-fallback-secret-key',
        signOptions: {
          expiresIn: '24h',
        },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: Otp.name, schema: OtpSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: SessionManagement.name, schema: SessionManagementSchema }
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy, JwtAuthGuard, SessionManagementService],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}

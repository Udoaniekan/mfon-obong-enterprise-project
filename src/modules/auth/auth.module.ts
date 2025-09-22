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
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';
import { MaintenanceModeModule } from '../maintenance-mode/maintenance-mode.module';
import { SessionManagementService } from '../session-management/services/session-management.service';
import { MongooseModule as SessionMongooseModule } from '@nestjs/mongoose';
import { SessionManagement, SessionManagementSchema } from '../session-management/schemas/session-management.schema';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EnhancedJwtAuthGuard } from './guards/enhanced-jwt-auth.guard';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    SystemActivityLogModule,
    MaintenanceModeModule,
    CommonModule, // Import CommonModule for enhanced security services
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
      { name: SessionManagement.name, schema: SessionManagementSchema }
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService, 
    LocalStrategy, 
    JwtStrategy, 
    JwtAuthGuard, 
    EnhancedJwtAuthGuard,
    SessionManagementService
  ],
  exports: [AuthService, JwtAuthGuard, EnhancedJwtAuthGuard],
})
export class AuthModule {}

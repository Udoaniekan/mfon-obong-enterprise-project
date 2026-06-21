import { Module } from '@nestjs/common';
import { MaintenanceModeController } from './controllers/maintenance-mode.controller';
import { MaintenanceModeService } from './services/maintenance-mode.service';
import { MaintenanceModeGuard } from './guards/maintenance-mode.guard';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';
import { UsersModule } from '../users/users.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [SystemActivityLogModule, UsersModule, WebSocketModule],
  controllers: [MaintenanceModeController],
  providers: [MaintenanceModeService, MaintenanceModeGuard],
  exports: [MaintenanceModeService, MaintenanceModeGuard],
})
export class MaintenanceModeModule {}

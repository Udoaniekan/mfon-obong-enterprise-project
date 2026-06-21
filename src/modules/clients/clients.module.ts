import { Module } from '@nestjs/common';
import { ClientsService } from './services/clients.service';
import { ClientsController } from './controllers/clients.controller';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [SystemActivityLogModule, WebSocketModule],
  providers: [ClientsService],
  controllers: [ClientsController],
  exports: [ClientsService],
})
export class ClientsModule {}

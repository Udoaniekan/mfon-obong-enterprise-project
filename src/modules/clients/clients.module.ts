import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from './schemas/client.schema';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { ClientsService } from './services/clients.service';
import { ClientsController } from './controllers/clients.controller';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    SystemActivityLogModule,
    WebSocketModule,
  ],
  providers: [ClientsService],
  controllers: [ClientsController],
  exports: [ClientsService],
})
export class ClientsModule {}

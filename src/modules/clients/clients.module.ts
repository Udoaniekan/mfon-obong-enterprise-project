import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from './schemas/client.schema';
import { ClientsService } from './services/clients.service';
import { ClientsController } from './controllers/clients.controller';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Client.name, schema: ClientSchema }]),
    SystemActivityLogModule,
  ],
  providers: [ClientsService],
  controllers: [ClientsController],
  exports: [ClientsService],
})
export class ClientsModule {}
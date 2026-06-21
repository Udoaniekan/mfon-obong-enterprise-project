import { Module } from '@nestjs/common';
import { TransactionsService } from './services/transactions.service';
import { TransactionsController } from './controllers/transactions.controller';
import { ProductsModule } from '../products/products.module';
import { ClientsModule } from '../clients/clients.module';
import { CategoriesModule } from '../categories/categories.module';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    ProductsModule,
    ClientsModule,
    CategoriesModule,
    SystemActivityLogModule,
    WebSocketModule,
  ],
  providers: [TransactionsService],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}

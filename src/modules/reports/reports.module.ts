import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsService } from './services/reports.service';
import { ReportsController } from './controllers/reports.controller';
import { Transaction, TransactionSchema } from '../transactions/schemas/transaction.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { Client, ClientSchema } from '../clients/schemas/client.schema';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Client.name, schema: ClientSchema },
    ]),
    SystemActivityLogModule,
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}

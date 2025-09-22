import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseTransactionService } from './services/database-transaction.service';
import { DecimalService } from './services/decimal.service';
import { StockReconciliationService } from './services/stock-reconciliation.service';
import { Product, ProductSchema } from '../modules/products/schemas/product.schema';
import { Transaction, TransactionSchema } from '../modules/transactions/schemas/transaction.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  providers: [
    DatabaseTransactionService,
    DecimalService,
    StockReconciliationService,
  ],
  exports: [
    DatabaseTransactionService,
    DecimalService,
    StockReconciliationService,
  ],
})
export class CommonModule {}
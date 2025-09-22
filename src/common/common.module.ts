import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseTransactionService } from './services/database-transaction.service';
import { DecimalService } from './services/decimal.service';
import { StockReconciliationService } from './services/stock-reconciliation.service';
import { RedisService } from './services/redis.service';
import { DeviceFingerprintService } from './services/device-fingerprint.service';
import { EnhancedJwtService } from './services/enhanced-jwt.service';
import { InputSanitizationService } from './services/simple-sanitization.service';
import { Product, ProductSchema } from '../modules/products/schemas/product.schema';
import { Transaction, TransactionSchema } from '../modules/transactions/schemas/transaction.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRATION', '15m'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    DatabaseTransactionService,
    DecimalService,
    StockReconciliationService,
    RedisService,
    DeviceFingerprintService,
    EnhancedJwtService,
    InputSanitizationService,
  ],
  exports: [
    DatabaseTransactionService,
    DecimalService,
    StockReconciliationService,
    RedisService,
    DeviceFingerprintService,
    EnhancedJwtService,
    InputSanitizationService,
  ],
})
export class CommonModule {}
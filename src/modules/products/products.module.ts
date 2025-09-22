import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { ProductsService } from './services/products.service';
import { ProductsController } from './controllers/products.controller';
import { InventoryController } from './controllers/inventory.controller';
import { CategoriesModule } from '../categories/categories.module';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';
import { WebSocketModule } from '../websocket/websocket.module';
import { PaginationService } from '../../common/services/pagination.service';
import { CacheService } from '../../common/services/cache.service';
import { QueryOptimizationService } from '../../common/services/query-optimization.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
    CategoriesModule,
    SystemActivityLogModule,
    WebSocketModule,
  ],
  providers: [
    ProductsService,
    PaginationService,
    CacheService,
    QueryOptimizationService,
  ],
  controllers: [ProductsController, InventoryController],
  exports: [ProductsService, MongooseModule],
})
export class ProductsModule {}

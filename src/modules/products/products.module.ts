import { Module } from '@nestjs/common';
import { ProductsService } from './services/products.service';
import { ProductsController } from './controllers/products.controller';
import { CategoriesModule } from '../categories/categories.module';
import { SystemActivityLogModule } from '../system-activity-logs/system-activity-log.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    CategoriesModule,
    SystemActivityLogModule,
    WebSocketModule,
  ],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}

import { Module } from '@nestjs/common';
import { ColumnSettingsController } from './controllers/column-settings.controller';
import { ColumnSettingsService } from './services/column-settings.service';

@Module({
  controllers: [ColumnSettingsController],
  providers: [ColumnSettingsService],
  exports: [ColumnSettingsService],
})
export class ColumnSettingsModule {}

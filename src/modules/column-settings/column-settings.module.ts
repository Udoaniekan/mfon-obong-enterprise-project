import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ColumnSettingsController } from './controllers/column-settings.controller';
import { ColumnSettingsService } from './services/column-settings.service';
import { ColumnSetting, ColumnSettingSchema } from './schemas/column-setting.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ColumnSetting.name, schema: ColumnSettingSchema },
    ]),
  ],
  controllers: [ColumnSettingsController],
  providers: [ColumnSettingsService],
  exports: [ColumnSettingsService],
})
export class ColumnSettingsModule {}

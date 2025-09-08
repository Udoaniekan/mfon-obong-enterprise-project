import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ColumnSetting, ColumnSettingDocument } from '../schemas/column-setting.schema';
import { UpdateColumnSettingDto, DEFAULT_VISIBLE_COLUMNS } from '../dto/column-setting.dto';
import { UserDocument } from '../../users/schemas/user.schema';

@Injectable()
export class ColumnSettingsService {
  constructor(
    @InjectModel(ColumnSetting.name)
    private columnSettingModel: Model<ColumnSettingDocument>,
  ) {}

  async getColumnSettings(
    userId: string,
    tableName: string,
  ): Promise<{ visibleColumns: string[]; columnOrder?: string[] }> {
    const setting = await this.columnSettingModel
      .findOne({ userId, tableName })
      .exec();

    if (!setting) {
      // Return default settings if no custom settings exist
      return {
        visibleColumns: DEFAULT_VISIBLE_COLUMNS,
        columnOrder: DEFAULT_VISIBLE_COLUMNS,
      };
    }

    return {
      visibleColumns: setting.visibleColumns,
      columnOrder: setting.columnOrder || setting.visibleColumns,
    };
  }

  async updateColumnSettings(
    userId: string,
    tableName: string,
    updateDto: UpdateColumnSettingDto,
  ): Promise<ColumnSettingDocument> {
    const setting = await this.columnSettingModel
      .findOneAndUpdate(
        { userId, tableName },
        {
          visibleColumns: updateDto.visibleColumns,
          columnOrder: updateDto.columnOrder || updateDto.visibleColumns,
        },
        { 
          new: true, 
          upsert: true, // Create if doesn't exist
          runValidators: true 
        }
      )
      .exec();

    return setting;
  }

  async resetColumnSettings(
    userId: string,
    tableName: string,
  ): Promise<{ message: string; visibleColumns: string[] }> {
    await this.columnSettingModel
      .findOneAndDelete({ userId, tableName })
      .exec();

    return {
      message: 'Column settings reset to default',
      visibleColumns: DEFAULT_VISIBLE_COLUMNS,
    };
  }

  async getAllAvailableColumns(tableName: string): Promise<string[]> {
    // For users table, return all available columns
    if (tableName === 'users') {
      return DEFAULT_VISIBLE_COLUMNS;
    }

    // Can be extended for other tables in the future
    return [];
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateColumnSettingDto, DEFAULT_VISIBLE_COLUMNS } from '../dto/column-setting.dto';

@Injectable()
export class ColumnSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getColumnSettings(
    userId: string,
    tableName: string,
  ): Promise<{ visibleColumns: string[]; columnOrder?: string[] }> {
    const setting = await this.prisma.columnSetting.findUnique({
      where: { userId_tableName: { userId, tableName } },
    });

    if (!setting) {
      return {
        visibleColumns: DEFAULT_VISIBLE_COLUMNS,
        columnOrder: DEFAULT_VISIBLE_COLUMNS,
      };
    }

    return {
      visibleColumns: setting.visibleColumns,
      columnOrder: setting.columnOrder.length > 0 ? setting.columnOrder : setting.visibleColumns,
    };
  }

  async updateColumnSettings(
    userId: string,
    tableName: string,
    updateDto: UpdateColumnSettingDto,
  ): Promise<any> {
    const setting = await this.prisma.columnSetting.upsert({
      where: { userId_tableName: { userId, tableName } },
      create: {
        userId,
        tableName,
        visibleColumns: updateDto.visibleColumns,
        columnOrder: updateDto.columnOrder || updateDto.visibleColumns,
      },
      update: {
        visibleColumns: updateDto.visibleColumns,
        columnOrder: updateDto.columnOrder || updateDto.visibleColumns,
      },
    });

    return { ...setting, _id: setting.id };
  }

  async resetColumnSettings(
    userId: string,
    tableName: string,
  ): Promise<{ message: string; visibleColumns: string[] }> {
    await this.prisma.columnSetting.deleteMany({ where: { userId, tableName } });
    return {
      message: 'Column settings reset to default',
      visibleColumns: DEFAULT_VISIBLE_COLUMNS,
    };
  }

  async getAllAvailableColumns(tableName: string): Promise<string[]> {
    if (tableName === 'users') {
      return DEFAULT_VISIBLE_COLUMNS;
    }
    return [];
  }
}

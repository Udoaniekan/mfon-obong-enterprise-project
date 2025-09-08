import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../../decorators/roles.decorators';
import { UserRole } from '../../../common/enums';
import { ColumnSettingsService } from '../services/column-settings.service';
import {
  UpdateColumnSettingDto,
  GetColumnSettingParamsDto,
} from '../dto/column-setting.dto';

@Controller('column-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.MAINTAINER)
export class ColumnSettingsController {
  constructor(
    private readonly columnSettingsService: ColumnSettingsService,
  ) {}

  @Get(':tableName')
  async getColumnSettings(
    @Param() params: GetColumnSettingParamsDto,
    @Request() req,
  ) {
    return this.columnSettingsService.getColumnSettings(
      req.user.userId,
      params.tableName,
    );
  }

  @Put(':tableName')
  async updateColumnSettings(
    @Param() params: GetColumnSettingParamsDto,
    @Body() updateDto: UpdateColumnSettingDto,
    @Request() req,
  ) {
    const setting = await this.columnSettingsService.updateColumnSettings(
      req.user.userId,
      params.tableName,
      updateDto,
    );

    return {
      message: 'Column settings updated successfully',
      data: {
        visibleColumns: setting.visibleColumns,
        columnOrder: setting.columnOrder,
      },
    };
  }

  @Delete(':tableName')
  async resetColumnSettings(
    @Param() params: GetColumnSettingParamsDto,
    @Request() req,
  ) {
    return this.columnSettingsService.resetColumnSettings(
      req.user.userId,
      params.tableName,
    );
  }

  @Get(':tableName/available-columns')
  async getAvailableColumns(@Param() params: GetColumnSettingParamsDto) {
    const availableColumns = await this.columnSettingsService.getAllAvailableColumns(
      params.tableName,
    );

    return {
      tableName: params.tableName,
      availableColumns,
    };
  }
}

import { IsArray, IsString, IsOptional, IsEnum, ArrayNotEmpty } from 'class-validator';

export class UpdateColumnSettingDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  visibleColumns: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columnOrder?: string[];
}

export class GetColumnSettingParamsDto {
  @IsString()
  @IsEnum(['users'])
  tableName: string;
}

export enum AvailableColumns {
  NAME = 'name',
  EMAIL = 'email',
  ROLE = 'role',
  PERMISSIONS = 'permissions',
  STATUS = 'status',
  LOCATION = 'location',
  CREATED_AT = 'createdAt',
  LAST_LOGIN = 'lastLogin',
}

export const DEFAULT_VISIBLE_COLUMNS = [
  AvailableColumns.NAME,
  AvailableColumns.EMAIL,
  AvailableColumns.ROLE,
  AvailableColumns.PERMISSIONS,
  AvailableColumns.STATUS,
  AvailableColumns.LOCATION,
  AvailableColumns.CREATED_AT,
  AvailableColumns.LAST_LOGIN,
];

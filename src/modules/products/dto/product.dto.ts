import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PackagingUnit } from '../../../common/enums';

export class BulkPriceDto {
  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  type: string;

  @IsNotEmpty()
  @IsEnum(PackagingUnit)
  primaryUnit: PackagingUnit;

  @IsOptional()
  @IsEnum(PackagingUnit)
  secondaryUnit?: PackagingUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  conversionRate?: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  primaryUnitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  secondaryUnitPrice?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested({ each: true })
  @Type(() => BulkPriceDto)
  bulkPrices?: BulkPriceDto[];

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  primaryUnitStock: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  secondaryUnitStock?: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  minStockLevel: number;
}

export class UpdateProductDto extends CreateProductDto {
  @IsOptional()
  name: string;

  @IsOptional()
  type: string;

  @IsOptional()
  primaryUnit: PackagingUnit;

  @IsOptional()
  primaryUnitPrice: number;

  @IsOptional()
  primaryUnitStock: number;

  @IsOptional()
  minStockLevel: number;
}

export class UpdateStockDto {
  @IsNotEmpty()
  @IsNumber()
  quantity: number;

  @IsNotEmpty()
  @IsEnum(PackagingUnit)
  unit: PackagingUnit;

  @IsNotEmpty()
  @IsString()
  operation: 'add' | 'subtract';
}

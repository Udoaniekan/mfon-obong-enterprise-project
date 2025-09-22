import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsMongoId,
  IsEnum,
} from 'class-validator';
import { 
  IsValidMoney, 
  IsValidQuantity 
} from '../../../common/decorators/validation.decorators';

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsMongoId()
  categoryId: string;

  @IsNotEmpty()
  @IsString()
  unit: string;

  @IsNotEmpty()
  @IsValidMoney()
  unitPrice: number;

  @IsNotEmpty()
  @IsValidQuantity()
  stock: number;

  @IsNotEmpty()
  @IsValidQuantity()
  minStockLevel: number;

  @IsNotEmpty()
  @IsMongoId()
  branchId: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsValidMoney()
  unitPrice?: number;

  @IsOptional()
  @IsValidQuantity()
  stock?: number;

  @IsOptional()
  @IsValidQuantity()
  minStockLevel?: number;

  @IsOptional()
  @IsMongoId()
  branchId?: string;
}

export enum StockOperation {
  ADD = 'add',
  SUBTRACT = 'subtract',
}

export class UpdateStockDto {
  @IsValidQuantity()
  @IsNotEmpty()
  readonly quantity: number;

  @IsString()
  @IsNotEmpty()
  readonly unit: string;

  @IsEnum(StockOperation)
  @IsNotEmpty()
  readonly operation: StockOperation;
}

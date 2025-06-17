import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsMongoId,
  IsEnum
} from 'class-validator';

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
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  stock: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  minStockLevel: number;
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
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockLevel?: number;

  @IsOptional()
  isActive?: boolean;
}

export enum StockOperation {
  ADD = 'add',
  SUBTRACT = 'subtract'
}

export class UpdateStockDto {
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  readonly quantity: number;
  
  @IsString()
  @IsNotEmpty()
  readonly unit: string;

  @IsEnum(StockOperation)
  @IsNotEmpty()
  readonly operation: StockOperation;
}

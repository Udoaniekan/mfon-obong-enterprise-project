import {
  IsString,
  IsNumber,
  IsArray,
  IsMongoId,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsDate,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TransactionItemDto {
  @IsMongoId()
  productId: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  unit: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;
}

export class CreateTransactionDto {
  @IsMongoId()
  clientId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDto)
  items: TransactionItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountPaid?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountPaid?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsBoolean()
  isPickedUp?: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  pickupDate?: Date;

  @IsOptional()
  @IsEnum(['PENDING', 'COMPLETED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryTransactionsDto {
  @IsOptional()
  @IsMongoId()
  clientId?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsEnum(['PENDING', 'COMPLETED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsBoolean()
  isPickedUp?: boolean;
}

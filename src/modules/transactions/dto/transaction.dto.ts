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
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WalkInClientDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

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

// ...existing code...

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  PURCHASE = 'PURCHASE',
  PICKUP = 'PICKUP',
}

export class CreateTransactionDto {
  @IsOptional()
  @IsMongoId()
  clientId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WalkInClientDto)
  walkInClient?: WalkInClientDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDto)
  items: TransactionItemDto[];

  @IsNotEmpty()
  @IsEnum(TransactionType)
  type: TransactionType;

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

  @IsMongoId()
  branchId: string;

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

  @IsOptional()
  @IsMongoId()
  branchId?: string;
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

  @IsOptional()
  @IsMongoId()
  branchId?: string;
}

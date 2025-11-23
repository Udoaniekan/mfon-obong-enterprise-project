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
  IsInt,
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

  @IsOptional()
  @IsNumber()
  @Min(0)
  wholesalePrice?: number;
}

// ...existing code...

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  PURCHASE = 'PURCHASE',
  PICKUP = 'PICKUP',
  RETURN = 'RETURN',
  WHOLESALE = 'WHOLESALE',
}

export class CreateTransactionDto {
  @IsOptional()
  @IsMongoId()
  clientId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WalkInClientDto)
  walkInClient?: WalkInClientDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDto)
  items?: TransactionItemDto[];

  @IsNotEmpty()
  @IsEnum(TransactionType)
  type: TransactionType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  transportFare?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  loadingAndOffloading?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  loading?: number;

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

  // Optional accounting date for backdating transactions. If omitted, server will use current date.
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  // Fields for RETURN transactions
  @IsOptional()
  @IsMongoId()
  referenceTransactionId?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualAmountReturned?: number;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  transportFare?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  loadingAndOffloading?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  loading?: number;

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

export class CalculateTransactionDto {
  @IsOptional()
  @IsMongoId()
  clientId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WalkInClientDto)
  walkInClient?: WalkInClientDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDto)
  items?: TransactionItemDto[];

  @IsNotEmpty()
  @IsEnum(TransactionType)
  type: TransactionType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  transportFare?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  loadingAndOffloading?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  loading?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountPaid?: number;

  @IsMongoId()
  branchId: string;
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

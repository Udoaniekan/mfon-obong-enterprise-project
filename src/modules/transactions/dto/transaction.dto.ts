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
import { 
  IsValidMoney, 
  IsValidQuantity, 
  IsValidNigerianPhone,
  IsValidTransactionTotal 
} from '../../../common/decorators/validation.decorators';

export class WalkInClientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsValidNigerianPhone()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class TransactionItemDto {
  @IsMongoId()
  productId: string;

  @IsValidQuantity()
  quantity: number;

  @IsString()
  @IsNotEmpty()
  unit: string;

  @IsOptional()
  @IsValidMoney()
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
  @IsValidMoney()
  discount?: number;

  @IsOptional()
  @IsValidMoney()
  amountPaid?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsMongoId()
  branchId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Computed field validation - total should match calculated total
  @IsOptional()
  @IsValidMoney()
  @IsValidTransactionTotal()
  total?: number;

  // Computed field validation - subtotal 
  @IsOptional()
  @IsValidMoney()
  subtotal?: number;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsValidMoney()
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

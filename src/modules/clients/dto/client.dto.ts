import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsNumber,
  Min,
  IsEnum,
  IsDate,
  IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';
import { 
  IsValidMoney, 
  IsValidNigerianPhone 
} from '../../../common/decorators/validation.decorators';

export class CreateClientDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsValidNigerianPhone()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsValidMoney()
  balance?: number;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsValidNigerianPhone()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsNotEmpty()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsValidMoney()
  balance?: number;
}

export class AddTransactionDto {
  @IsNotEmpty()
  @IsEnum(['DEPOSIT', 'PURCHASE', 'PICKUP'])
  type: 'DEPOSIT' | 'PURCHASE' | 'PICKUP';

  @IsNotEmpty()
  @IsValidMoney()
  amount: number;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class QueryClientsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsValidMoney()
  minBalance?: number;

  @IsOptional()
  @IsValidMoney()
  maxBalance?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}

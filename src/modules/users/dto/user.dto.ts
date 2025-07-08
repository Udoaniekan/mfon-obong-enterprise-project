import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength, IsMongoId, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../../../common/enums';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string; 

  @IsNotEmpty()
  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsNotEmpty()
  @IsEnum(UserRole)
  role: UserRole;
  
  @IsNotEmpty()
  @IsMongoId()
  branchId: string;

  @IsOptional()
  @IsString()
  profilePicture?: string;

  @IsOptional()
  profilePictureMeta?: {
    public_id?: string;
    format?: string;
    resource_type?: string;
    width?: number;
    height?: number;
    bytes?: number;
    [key: string]: any;
  };
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsMongoId()
  branchId?: string;

  @IsOptional()
  @IsString()
  profilePicture?: string;

  @IsOptional()
  profilePictureMeta?: {
    public_id?: string;
    format?: string;
    resource_type?: string;
    width?: number;
    height?: number;
    bytes?: number;
    [key: string]: any;
  };
}

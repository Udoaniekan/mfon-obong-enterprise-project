import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
  IsMongoId,
  IsOptional,
  Matches,
} from 'class-validator';
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
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message:
        'Password must be at least 8 characters long, include uppercase, lowercase, number, and special character',
    },
  )
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

  @IsNotEmpty()
  @IsString()
  branch: string;

  @IsOptional()
  @IsString()
  branchAddress?: string;

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
  branch?: string;

  @IsOptional()
  @IsString()
  branchAddress?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message:
        'Password must be at least 8 characters long, include uppercase, lowercase, number, and special character',
    },
  )
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

import { IsNotEmpty, IsString, IsArray, IsOptional, IsBoolean, IsMongoId } from 'class-validator';

export class CreateCategoryDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  units: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsMongoId()
  branchId: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  units?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsMongoId()
  branchId?: string;
}

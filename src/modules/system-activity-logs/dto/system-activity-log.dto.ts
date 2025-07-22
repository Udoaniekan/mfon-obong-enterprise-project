import { IsString, IsNotEmpty, IsOptional, IsDate } from 'class-validator';

export class CreateSystemActivityLogDto {
  @IsString()
  @IsNotEmpty()
  action: string;

  @IsString()
  @IsNotEmpty()
  details: string;

  @IsString()
  @IsNotEmpty()
  performedBy: string;

  @IsString()
  @IsNotEmpty()
  role: string;

  @IsString()
  @IsNotEmpty()
  device: string;

  @IsOptional()
  @IsDate()
  timestamp?: Date;
}
import { IsOptional, IsString } from 'class-validator';

export class BlockUserDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

import { IsOptional, IsString } from 'class-validator';

export class ToggleMaintenanceModeDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
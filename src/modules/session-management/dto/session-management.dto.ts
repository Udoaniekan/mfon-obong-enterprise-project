import { IsNotEmpty, IsString, IsOptional, IsBoolean, Matches } from 'class-validator';

export class SetActiveHoursDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:mm format (24-hour)',
  })
  startTime: string; // Format: "HH:mm" (e.g., "08:00")

  @IsNotEmpty()
  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:mm format (24-hour)',
  })
  endTime: string; // Format: "HH:mm" (e.g., "21:00")

  @IsNotEmpty()
  @IsString()
  timezone: string; // Timezone string (e.g., "Africa/Lagos", "UTC")

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateActiveHoursDto {
  @IsOptional()
  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:mm format (24-hour)',
  })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:mm format (24-hour)',
  })
  endTime?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

export class SessionStatusResponseDto {
  isActiveHours: boolean;
  currentTime: string;
  activeHours?: {
    startTime: string;
    endTime: string;
    timezone: string;
    setBy: string;
    setByEmail: string;
    description?: string;
  };
  message: string;
}
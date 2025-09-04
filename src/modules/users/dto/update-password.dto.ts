import { IsNotEmpty, IsString, MinLength, Matches, IsOptional } from 'class-validator';

export class UpdatePasswordDto {
  @IsOptional()
  @IsString()
  previousPassword?: string;

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
  newPassword: string;
}
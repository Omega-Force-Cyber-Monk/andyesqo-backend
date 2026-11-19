import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsTimeZone,
} from 'class-validator';

/** "Business Settings & Operational Rules" → Company Information. */
export class UpdateBusinessSettingsDto {
  /** Company Legal Entity Name */
  @IsOptional() @IsString() name?: string;
  /** ABN / Business Number */
  @IsOptional() @IsString() businessNumber?: string;
  @IsOptional() @IsEmail() supportEmail?: string;
  @IsOptional() @IsString() supportPhone?: string;
  @IsOptional() @IsString() address?: string;
  /** Require authenticator OTP code on every login. */
  @IsOptional() @IsBoolean() twoFactorRequired?: boolean;
  /** IANA time zone used for shift times and reminders, e.g. Australia/Perth. */
  @IsOptional() @IsTimeZone() timezone?: string;
}

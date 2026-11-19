import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const PASSWORD_MSG =
  'Password must be at least 8 characters and contain letters and numbers';

export class LoginDto {
  /**
   * Email address, or Employee ID (driver app login screen).
   * @example driver@nanda.test
   */
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  identifier: string;

  /** @example Password123 */
  @IsString()
  @IsNotEmpty()
  password: string;

  /**
   * "Remember Me" gives a 30-day refresh token instead of 7 days.
   * @example true
   */
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class RefreshDto {
  /** Refresh token from login, MFA verification or the previous refresh. */
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class MfaChallengeDto {
  /** Challenge returned by login or /auth/mfa/setup (valid 5 minutes). */
  @IsString() @IsNotEmpty() @MaxLength(256) challenge: string;
}

export class MfaVerifyDto extends MfaChallengeDto {
  /**
   * Six-digit code from the authenticator app (send this or recoveryCode).
   * @example 123456
   */
  @IsOptional() @IsString() @Matches(/^\d{6}$/) code?: string;
  /**
   * One-time recovery code, instead of `code`.
   * @example ABCDE-FGHJK
   */
  @IsOptional()
  @IsString()
  @Matches(
    /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/i,
  )
  recoveryCode?: string;
}

export class MfaSetupDto {
  @IsString() @IsNotEmpty() password: string;
}

export class MfaReplaceDto {
  @IsString() @IsNotEmpty() password: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) code?: string;
  @IsOptional()
  @IsString()
  @Matches(
    /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/i,
  )
  recoveryCode?: string;
}

export class MfaCodeDto {
  /**
   * Six-digit code from the new authenticator app.
   * @example 123456
   */
  @IsString() @Matches(/^\d{6}$/) code: string;
}

export class ForgotPasswordDto {
  /**
   * Registered email or Employee ID.
   * @example driver@nanda.test
   */
  @IsString()
  @IsNotEmpty()
  identifier: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG })
  newPassword: string;

  @IsString()
  confirmPassword: string;
}

export class ActivateAccountDto {
  /** Token from the 7-day invitation link. */
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG })
  password: string;

  @IsString()
  confirmPassword: string;

  /** "I agree to the Terms & Conditions and Privacy Policy". */
  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms' })
  acceptTerms: boolean;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG })
  newPassword: string;

  @IsString()
  confirmPassword: string;
}

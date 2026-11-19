import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/** Every environment variable the app reads. Validated once at startup. */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32)
  TOTP_ENCRYPTION_KEY: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  /** Refresh token lifetime in days (normal login). */
  @IsInt()
  @Min(1)
  @IsOptional()
  REFRESH_TOKEN_TTL_DAYS: number = 7;

  /** Refresh token lifetime in days when "Remember Me" is ticked. */
  @IsInt()
  @Min(1)
  @IsOptional()
  REFRESH_TOKEN_REMEMBER_TTL_DAYS: number = 30;

  @IsInt()
  @Min(4)
  @Max(15)
  @IsOptional()
  BCRYPT_SALT_ROUNDS: number = 10;

  /** Comma separated list, or * for any origin. */
  @IsString()
  @IsOptional()
  CORS_ORIGINS: string = '*';

  /** Front-end base URL used in invitation and password reset links. */
  @IsString()
  @IsOptional()
  APP_URL: string = 'http://localhost:5173';

  @IsString()
  @IsOptional()
  UPLOAD_DIR: string = 'uploads';

  /** Requests per minute per client IP to each auth endpoint (login, reset, MFA). */
  @IsInt()
  @Min(1)
  @IsOptional()
  AUTH_RATE_LIMIT: number = 10;

  /**
   * Express "trust proxy" setting when behind a load balancer, e.g. 1 or
   * "loopback", so rate limits and audit logs see the real client IP.
   */
  @IsString()
  @IsOptional()
  TRUST_PROXY?: string;

  /** Driver GPS points older than this are purged daily. */
  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  LOCATION_RETENTION_DAYS: number = 90;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return validated;
}

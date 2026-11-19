import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { PermissionModule } from '../../generated/prisma/enums.js';

export class DepotScopeDto {
  @IsBoolean() allDepots: boolean;
  @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) depotIds: string[];
}

export class PermissionOverrideDto {
  @IsEnum(PermissionModule) module: PermissionModule;
  @IsBoolean() canView: boolean;
  @IsBoolean() canEdit: boolean;
  @IsDateString() startsAt: string;
  @IsDateString() expiresAt: string;
}

export class ResetMfaDto {
  /** Why the authenticator is being reset (recorded in the audit log and emailed to the user). */
  @IsString()
  @Length(3, 500)
  reason: string;
}

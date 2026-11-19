import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PermissionModule } from '../../generated/prisma/enums.js';

export class CreateRoleDto {
  /** e.g. Safety Inspector, Shift Supervisor */
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Super admin only: create for a business. Omit for a platform default role. */
  @IsOptional()
  @IsUUID()
  businessId?: string;
}

export class PermissionCellDto {
  @IsEnum(PermissionModule)
  module: PermissionModule;

  @IsBoolean()
  canView: boolean;

  @IsBoolean()
  canEdit: boolean;
}

export class RolePermissionsDto {
  @IsUUID()
  roleId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionCellDto)
  permissions: PermissionCellDto[];
}

/** "Save Permission Changes" sends the whole matrix. */
export class SaveMatrixDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionsDto)
  roles: RolePermissionsDto[];
}

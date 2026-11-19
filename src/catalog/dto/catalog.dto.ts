import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Severity } from '../../generated/prisma/enums.js';

/** "Create Damage Category" modal. */
export class CreateDamageTypeDto {
  @IsString() @IsNotEmpty() name: string;
  /** Guidance for drivers when this category applies. */
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(Severity) defaultSeverity?: Severity;
  @IsOptional() @IsBoolean() requiresPhoto?: boolean;
  /** Active (visible to drivers in report form). */
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() autoGroundVehicle?: boolean;
  @IsOptional() @IsUUID() businessId?: string;
}
export class UpdateDamageTypeDto extends PartialType(CreateDamageTypeDto) {}

/** "Edit Incident Category" modal. */
export class CreateIncidentTypeDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(Severity) defaultSeverity?: Severity;
  @IsOptional() @IsBoolean() requiresSupervisorReview?: boolean;
  @IsOptional() @IsBoolean() requiresPoliceReport?: boolean;
  @IsOptional() @IsBoolean() requiresSafeWorkNotice?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsUUID() businessId?: string;
}
export class UpdateIncidentTypeDto extends PartialType(CreateIncidentTypeDto) {}

import { IsUploadUrl } from '../../uploads/upload-url.validator.js';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  DamageLocation,
  DamageReportStatus,
  Severity,
  YesNoUnsure,
} from '../../generated/prisma/enums.js';
import { BusinessQueryDto } from '../../common/dto/business-query.dto.js';

/** "Report Vehicle Damage" form (driver app). */
export class CreateDamageReportDto {
  @IsUUID() vehicleId: string;
  /** Damage Type (configured by admin). */
  @IsOptional() @IsUUID() damageTypeId?: string;
  @IsOptional() @IsUUID() inspectionId?: string;

  /** Where is the damage located? Select all that apply. */
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(DamageLocation, { each: true })
  locations: DamageLocation[];

  /** MINOR / MODERATE / MAJOR / UNSAFE (vehicle unsafe to drive). */
  @IsEnum(Severity) severity: Severity;

  @IsString() @IsNotEmpty() description: string;
  @IsOptional() @IsArray() @IsUploadUrl({ each: true }) photos?: string[];
  /** When did you notice the damage? */
  @IsOptional() @IsDateString() noticedAt?: string;
  /** Was the vehicle involved in an accident? */
  @IsOptional() @IsEnum(YesNoUnsure) involvedInAccident?: YesNoUnsure;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) odometerKm?: number;
}

/** "Fleet Manager Assessment" + "Repair Decision & Estimates". */
export class AssessDamageDto {
  @IsOptional() @IsEnum(Severity) assessedSeverity?: Severity;
  /** e.g. "No Safety Impact" */
  @IsOptional() @IsString() safetyImpact?: string;
  @IsOptional() @IsBoolean() canContinueOperating?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedParts?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedLabour?: number;
}

export class DamageQueryDto extends BusinessQueryDto {
  @IsOptional() @IsEnum(DamageReportStatus) status?: DamageReportStatus;
  @IsOptional() @IsUUID() vehicleId?: string;
}

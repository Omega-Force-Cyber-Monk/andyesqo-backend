import { IsUploadUrl } from '../../uploads/upload-url.validator.js';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ChecklistResult,
  InspectionStatus,
  InspectionType,
} from '../../generated/prisma/enums.js';
import { BusinessQueryDto } from '../../common/dto/business-query.dto.js';

export class ChecklistItemDto {
  /** Tyres, Lights, Mirrors, Brakes ... */
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(ChecklistResult)
  result: ChecklistResult;

  @IsOptional()
  @IsString()
  note?: string;
}

/** Pre-Shift Inspection / Post-Shift Vehicle Check. */
export class CreateInspectionDto {
  @IsUUID()
  vehicleId: string;

  @IsEnum(InspectionType)
  type: InspectionType;

  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items: ChecklistItemDto[];

  /** Photo URLs from POST /uploads. */
  @IsOptional()
  @IsArray()
  @IsUploadUrl({ each: true })
  photos?: string[];

  /** Additional comments. */
  @IsOptional()
  @IsString()
  comments?: string;

  /** Time spent, e.g. 4m 33s = 273. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  odometerKm?: number;
}

export class InspectionQueryDto extends BusinessQueryDto {
  @IsOptional() @IsEnum(InspectionType) type?: InspectionType;
  @IsOptional() @IsEnum(InspectionStatus) status?: InspectionStatus;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  /** YYYY-MM-DD */
  @IsOptional() @IsDateString() date?: string;
}

export class GroundDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

import { OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import {
  MaintenanceStatus,
  MaintenanceType,
  Priority,
  ServiceLocationType,
} from '../../generated/prisma/enums.js';
import { BusinessQueryDto } from '../../common/dto/business-query.dto.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "Schedule New Maintenance" wizard (select vehicle → details → tasks → date → location → cost → review). */
export class CreateMaintenanceDto {
  @IsUUID() vehicleId: string;
  @IsEnum(MaintenanceType) type: MaintenanceType;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsString() description?: string;
  /** Required Work Checklist */
  @IsOptional() @IsArray() @IsString({ each: true }) tasks?: string[];
  /** Maintenance Date (YYYY-MM-DD) */
  @IsDateString() scheduledDate: string;
  /** HH:mm */
  @IsOptional() @Matches(HHMM) startTime?: string;
  /** HH:mm */
  @IsOptional() @Matches(HHMM) expectedCompletion?: string;
  @IsOptional() @IsUUID() depotId?: string;
  @IsOptional() @IsEnum(ServiceLocationType) locationType?: ServiceLocationType;
  @IsOptional() @IsString() providerName?: string;
  @IsOptional() @IsString() providerPhone?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedParts?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedLabour?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedDowntimeHours?: number;
}

export class UpdateMaintenanceDto extends PartialType(
  OmitType(CreateMaintenanceDto, ['vehicleId', 'tasks'] as const),
) {}

export class MaintenanceStatusDto {
  @IsEnum(MaintenanceStatus) status: MaintenanceStatus;
  /** Actual cost can be updated after maintenance work is completed. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) actualCost?: number;
}

export class TaskToggleDto {
  @IsBoolean() done: boolean;
}

export class AvailabilityCheckDto {
  @IsUUID() vehicleId: string;
  @IsDateString() date: string;
}

export class MaintenanceQueryDto extends BusinessQueryDto {
  @IsOptional() @IsEnum(MaintenanceStatus) status?: MaintenanceStatus;
  @IsOptional() @IsEnum(MaintenanceType) type?: MaintenanceType;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsUUID() vehicleId?: string;
  /** YYYY-MM, e.g. 2026-08 for "Maintenance Schedule — August 2026". */
  @IsOptional() @Matches(/^\d{4}-\d{2}$/) month?: string;
}

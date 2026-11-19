import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import {
  AvailabilityStatus,
  ShiftStatus,
  ShiftType,
  UserRole,
} from '../../generated/prisma/enums.js';
import { BusinessQueryDto } from '../../common/dto/business-query.dto.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CrewDto {
  @IsUUID() driverId: string;
  /** Optional assistant paired with the driver. */
  @IsOptional() @IsUUID() assistantId?: string;
  /** Step 3: Assign Vehicles. */
  @IsOptional() @IsUUID() vehicleId?: string;
}

export class ShiftTimesDto {
  /** Roster Date (YYYY-MM-DD) */
  @IsDateString() date: string;
  @IsOptional() @IsUUID() depotId?: string;
  @IsOptional() @IsEnum(ShiftType) type?: ShiftType;
  @Matches(HHMM) startTime: string;
  @Matches(HHMM) endTime: string;
  @IsOptional() @Matches(HHMM) breakStart?: string;
  @IsOptional() @Matches(HHMM) breakEnd?: string;
}

/** 3-step "Create Roster" modal: shift details → select crew → assign vehicles. */
export class CreateRosterDto extends ShiftTimesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CrewDto)
  crews: CrewDto[];

  /** Publish immediately (otherwise saved as Draft). */
  @IsOptional() @IsBoolean() publish?: boolean;

  @IsOptional() @IsUUID() businessId?: string;
}

/** "Edit shift" modal. */
export class UpdateShiftDto extends PartialType(ShiftTimesDto) {
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() assistantId?: string | null;
  @IsOptional() @IsUUID() vehicleId?: string | null;
  @IsOptional() @IsEnum(ShiftStatus) status?: ShiftStatus;
}

export class PublishDto {
  /** Publish these shifts, or … */
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) shiftIds?: string[];
  /** … every draft on this date (optionally one depot). */
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsUUID() depotId?: string;
  @IsOptional() @IsUUID() businessId?: string;
}

export class RosterQueryDto extends BusinessQueryDto {
  /** Single day (YYYY-MM-DD). Defaults to today when no range is given. */
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() depotId?: string;
  @IsOptional() @IsEnum(ShiftStatus) status?: ShiftStatus;
  @IsOptional() @IsEnum(ShiftType) type?: ShiftType;
}

export class AvailabilityQueryDto extends BusinessQueryDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsIn([UserRole.DRIVER, UserRole.ASSISTANT]) role?: UserRole;
  @IsOptional() @IsEnum(AvailabilityStatus) availability?: AvailabilityStatus;
  @IsOptional() @IsUUID() depotId?: string;
}

export class SetAvailabilityDto {
  @IsUUID() userId: string;
  @IsDateString() date: string;
  @IsEnum(AvailabilityStatus) status: AvailabilityStatus;
  @IsOptional() @IsString() note?: string;
}

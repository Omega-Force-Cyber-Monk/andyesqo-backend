import { IsUploadUrl } from '../../uploads/upload-url.validator.js';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  FuelEntryType,
  TimesheetStatus,
} from '../../generated/prisma/enums.js';
import { BusinessQueryDto } from '../../common/dto/business-query.dto.js';

export class ClockInDto {
  /** Defaults to today's shift. */
  @IsOptional() @IsUUID() shiftId?: string;
  /** e.g. "Sydney Depot, Parramatta Rd" or "lat,lng" */
  @IsOptional() @IsString() location?: string;
}

export class ClockOutDto {
  @IsOptional() @IsString() location?: string;
  /** Distance driven during the shift. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) distanceKm?: number;
  @IsOptional() @IsString() note?: string;
}

/** "Fuel Receipt" / "EV Charge Receipt" step of End Shift. */
export class CreateFuelLogDto {
  /** false = "No fuel today". */
  @IsBoolean() refuelled: boolean;
  @IsOptional() @IsUUID() shiftId?: string;
  @IsOptional() @IsEnum(FuelEntryType) type?: FuelEntryType;
  /** Fuel Station / Charging Station */
  @IsOptional() @IsString() station?: string;
  /** Amount Paid / Charging Cost */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amountPaid?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantityLitres?: number;
  /** Energy Added (kWh) */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) energyKwh?: number;
  /** Charge Duration in minutes */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationMinutes?: number;
  @IsOptional()
  @IsArray()
  @IsUploadUrl({ each: true })
  receiptPhotos?: string[];
}

export class TimesheetQueryDto extends BusinessQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(TimesheetStatus) timesheetStatus?: TimesheetStatus;
  @IsOptional() @IsUUID() userId?: string;
}

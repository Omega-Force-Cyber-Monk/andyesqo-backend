import { IsUploadUrl } from '../../uploads/upload-url.validator.js';
import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { DeliveryStatus, Priority } from '../../generated/prisma/enums.js';
import { BusinessQueryDto } from '../../common/dto/business-query.dto.js';

export class PackageDto {
  /** e.g. PKG-01 (auto if blank) */
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) weightKg?: number;
}

/** "Create New Delivery" modal (+ extra fields shown on delivery details). */
export class CreateDeliveryDto {
  /** Customer / Business Name */
  @IsString() @IsNotEmpty() customerName: string;
  /** Destination Delivery Address */
  @IsString() @IsNotEmpty() deliveryAddress: string;
  /** Operational Zone */
  @IsOptional() @IsString() zone?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  /** Scheduled Drop Time (ISO datetime) */
  @IsOptional() @IsDateString() scheduledDropTime?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;

  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() pickupAddress?: string;
  @IsOptional() @IsUUID() depotId?: string;
  @IsOptional() @IsString() loadingBay?: string;
  /** Delivery Window start / end (ISO datetime) */
  @IsOptional() @IsDateString() windowStart?: string;
  @IsOptional() @IsDateString() windowEnd?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) packageCount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) totalWeightKg?: number;
  @IsOptional() @IsBoolean() fragile?: boolean;
  @IsOptional() @IsString() specialInstructions?: string;
  @IsOptional() @IsInt() sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageDto)
  packages?: PackageDto[];

  @IsOptional() @IsUUID() businessId?: string;
}

export class UpdateDeliveryDto extends PartialType(
  OmitType(CreateDeliveryDto, ['packages', 'businessId'] as const),
) {
  @IsOptional() @IsEnum(DeliveryStatus) status?: DeliveryStatus;
}

export class PickupDto {
  @IsOptional() @IsArray() @IsUploadUrl({ each: true }) photos?: string[];
  /** Scan Bar Code result */
  @IsOptional() @IsString() barcode?: string;
}

/** "Delivery Confirmation". */
export class CompleteDeliveryDto {
  @IsOptional() @IsArray() @IsUploadUrl({ each: true }) photos?: string[];
  /** e.g. Left at front door, customer not home */
  @IsOptional() @IsString() notes?: string;
}

/** "Report Delay" on the navigation screen. */
export class DelayDto {
  @IsString() @IsNotEmpty() reason: string;
  /** New ETA (ISO datetime) */
  @IsOptional() @IsDateString() eta?: string;
}

export class EtaDto {
  @IsDateString() eta: string;
}

export class DeliveryQueryDto extends BusinessQueryDto {
  @IsOptional() @IsEnum(DeliveryStatus) status?: DeliveryStatus;
  /** YYYY-MM-DD (by scheduled drop time) */
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  /** Only deliveries running late (>15 min past ETA / drop time). */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  delayedOnly?: boolean;
}

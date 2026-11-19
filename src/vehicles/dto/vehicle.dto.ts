import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  FuelType,
  VehicleBodyType,
  VehicleStatus,
} from '../../generated/prisma/enums.js';
import { BusinessQueryDto } from '../../common/dto/business-query.dto.js';

/** "Add New Vehicle" modal. */
export class CreateVehicleDto {
  /** e.g. NSW-999 */
  @IsString()
  @IsNotEmpty()
  registration: string;

  /** e.g. V-1099 (auto-generated if blank) */
  @IsOptional()
  @IsString()
  code?: string;

  /** e.g. Toyota HiAce */
  @IsString()
  @IsNotEmpty()
  model: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  year?: number;
  @IsOptional() @IsEnum(VehicleBodyType) bodyType?: VehicleBodyType;
  @IsOptional() @IsEnum(FuelType) fuelType?: FuelType;
  @IsOptional() @IsString() capacity?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) odometerKm?: number;
  @IsOptional() @IsUUID() depotId?: string;
  @IsOptional() @IsDateString() lastServiceDate?: string;
  @IsOptional() @IsDateString() nextServiceDate?: string;
  @IsOptional() @IsDateString() registrationExpiry?: string;
  @IsOptional() @IsDateString() insuranceExpiry?: string;
  /** Super admin only. */
  @IsOptional() @IsUUID() businessId?: string;
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}

/** "Update Vehicle Status" modal. */
export class UpdateVehicleStatusDto {
  @IsEnum(VehicleStatus)
  status: VehicleStatus;

  /** Reason For Change */
  @IsOptional()
  @IsString()
  reason?: string;
}

/** "Assign Driver" modal / "Assign Vehicle" on roster vehicle details. */
export class AssignDriverDto {
  /** Pass null to unassign. */
  @IsOptional()
  @IsUUID()
  driverId?: string | null;
}

export class VehicleQueryDto extends BusinessQueryDto {
  @IsOptional() @IsEnum(VehicleStatus) status?: VehicleStatus;
  @IsOptional() @IsEnum(VehicleBodyType) bodyType?: VehicleBodyType;
  @IsOptional() @IsUUID() depotId?: string;
}

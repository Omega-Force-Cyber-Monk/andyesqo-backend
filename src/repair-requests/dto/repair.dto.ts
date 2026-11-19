import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Priority, RepairStatus } from '../../generated/prisma/enums.js';
import { BusinessQueryDto } from '../../common/dto/business-query.dto.js';

export class RepairFieldsDto {
  /** e.g. Front bumper damage */
  @IsString() @IsNotEmpty() issue: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  /** Workshop / mechanic shop. */
  @IsOptional() @IsString() provider?: string;
  /** Estimated Parts ($ AUD) */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedParts?: number;
  /** Estimated Labour ($ AUD) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedLabour?: number;
}

export class CreateRepairDto extends RepairFieldsDto {
  @IsUUID() vehicleId: string;
  @IsOptional() @IsUUID() damageReportId?: string;
  @IsOptional() @IsUUID() inspectionId?: string;
}

export class UpdateRepairDto extends PartialType(RepairFieldsDto) {}

export class RepairStatusDto {
  @IsEnum(RepairStatus) status: RepairStatus;
  /** Final cost when completing. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) actualCost?: number;
}

export class RepairQueryDto extends BusinessQueryDto {
  @IsOptional() @IsEnum(RepairStatus) status?: RepairStatus;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsUUID() vehicleId?: string;
}

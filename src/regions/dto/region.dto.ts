import { PartialType } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { BusinessRegionStatus } from '../../generated/prisma/enums.js';

export class CreateRegionDto {
  /** State code, e.g. NSW */
  @IsString()
  @Length(2, 10)
  code: string;

  /** e.g. New South Wales */
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  country?: string;

  /** e.g. "Sydney Metro, Hunter, Central Coast" */
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRegionDto extends PartialType(CreateRegionDto) {}

export class AssignRegionsDto {
  @IsUUID()
  businessId: string;

  /** Replaces the business's region list with these regions. */
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  regionIds: string[];
}

export class UpdateAssignmentDto {
  @IsEnum(BusinessRegionStatus)
  status: BusinessRegionStatus;
}

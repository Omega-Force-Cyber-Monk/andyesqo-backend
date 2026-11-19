import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { BusinessStatus } from '../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Step 2 of "Create Business": assign administrator now (optional). */
export class NewAdministratorDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  @Transform(lower)
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  sendInvitation?: boolean = true;
}

export class CreateBusinessDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  /** e.g. Courier / Logistics / Transport */
  @IsOptional() @IsString() businessType?: string;
  @IsOptional() @IsString() contactNumber?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() businessNumber?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewAdministratorDto)
  administrator?: NewAdministratorDto;

  /** Step 3: operating regions/states. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  regionIds?: string[];
}

export class UpdateBusinessDto extends PartialType(CreateBusinessDto) {
  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus;
}

export class BusinessQueryParams extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(BusinessStatus)
  status?: BusinessStatus;
}

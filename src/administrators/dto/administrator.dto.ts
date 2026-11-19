import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { UserStatus } from '../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** "Create Business Administrator" modal. */
export class CreateAdministratorDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  @Transform(lower)
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsUUID()
  businessId: string;

  /** Dispatches an activation link with a 7-day expiry token. */
  @IsOptional()
  @IsBoolean()
  sendInvitation?: boolean = true;
}

export class UpdateAdministratorDto extends PartialType(
  CreateAdministratorDto,
) {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class AdministratorQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

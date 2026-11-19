import { IsUploadUrl } from '../../uploads/upload-url.validator.js';
import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  EmploymentType,
  ShiftType,
  UserRole,
  UserStatus,
} from '../../generated/prisma/enums.js';
import { BusinessQueryDto } from '../../common/dto/business-query.dto.js';

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** "Add New User" modal. */
export class CreateUserDto {
  @IsEnum(UserRole)
  role: UserRole;

  /** Full Name is split into first/last name on save. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName: string;

  @IsEmail()
  @Transform(lower)
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** e.g. DRV-8838. Auto-generated from the role prefix if omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  depotId?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  /** "Send Invitation" toggle: email an onboarding link to set a password. */
  @IsOptional()
  @IsBoolean()
  sendInvitation?: boolean = true;

  /** Super admin only. */
  @IsOptional()
  @IsUUID()
  businessId?: string;

  @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @IsOptional() @IsDateString() joiningDate?: string;
  @IsOptional() @IsString() team?: string;
  @IsOptional() @IsUUID() supervisorId?: string;
  @IsOptional() @IsEnum(ShiftType) preferredShift?: ShiftType;
  @IsOptional() @IsString() licenceClass?: string;
  @IsOptional() @IsString() licenceNumber?: string;
  @IsOptional() @IsDateString() licenceExpiry?: string;
  @IsOptional() @IsString() visaStatus?: string;
  @IsOptional() @IsDateString() visaExpiry?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyContactPhone?: string;
}

/** "Edit User" modal. */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['sendInvitation', 'businessId'] as const),
) {}

/** Fields a user may edit on their own profile. */
export class UpdateMeDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsUploadUrl() avatarUrl?: string;
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyContactPhone?: string;
}

export class UserQueryDto extends BusinessQueryDto {
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsUUID() depotId?: string;
}

export class DateQueryDto {
  /** YYYY-MM-DD, defaults to today. */
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsUUID()
  businessId?: string;
}

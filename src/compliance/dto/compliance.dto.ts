import { IsUploadUrl } from '../../uploads/upload-url.validator.js';
import { PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  ComplianceDocumentType,
  UserRole,
} from '../../generated/prisma/enums.js';
import { BusinessQueryDto } from '../../common/dto/business-query.dto.js';

/** "Edit Compliance Document" modal. */
export class CreateDocumentDto {
  @IsEnum(ComplianceDocumentType) type: ComplianceDocumentType;
  /** Document Title, e.g. Medical Certificate, Safety Induction */
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsDateString() issuedAt?: string;
  /** Expiration date (YYYY-MM-DD) */
  @IsOptional() @IsDateString() expiresAt?: string;
  /** Attachment URL from POST /uploads. */
  @IsOptional() @IsUploadUrl() fileUrl?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}

export class ComplianceQueryDto extends BusinessQueryDto {
  @IsOptional() @IsIn([UserRole.DRIVER, UserRole.ASSISTANT]) role?: UserRole;
  @IsOptional() @IsIn(['COMPLIANT', 'REVIEW', 'NON_COMPLIANT']) status?: string;
  @IsOptional() @IsIn(['ELIGIBLE', 'NOT_ELIGIBLE']) eligibility?: string;
}

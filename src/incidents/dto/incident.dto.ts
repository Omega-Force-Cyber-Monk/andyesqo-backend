import { IsUploadUrl } from '../../uploads/upload-url.validator.js';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { IncidentStatus } from '../../generated/prisma/enums.js';
import { BusinessQueryDto } from '../../common/dto/business-query.dto.js';

/** "Incident Report – Report an issue with this delivery". */
export class CreateIncidentDto {
  @IsUUID() incidentTypeId: string;
  @IsOptional() @IsUUID() deliveryId?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsString() @IsNotEmpty() description: string;
  @IsOptional() @IsArray() @IsUploadUrl({ each: true }) photos?: string[];
  @IsOptional() @IsString() location?: string;
}

export class IncidentStatusDto {
  @IsEnum(IncidentStatus) status: IncidentStatus;
}

export class IncidentQueryDto extends BusinessQueryDto {
  @IsOptional() @IsEnum(IncidentStatus) status?: IncidentStatus;
  @IsOptional() @IsUUID() incidentTypeId?: string;
}

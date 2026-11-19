import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from './pagination.dto.js';

/** Pagination + optional businessId (only used by the platform super admin). */
export class BusinessQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  businessId?: string;
}

import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Free text search (name, ID, registration ...). */
  @IsOptional()
  @IsString()
  search?: string;
}

export function paginate(q: PaginationQueryDto) {
  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

export function pageResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    items,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
  };
}

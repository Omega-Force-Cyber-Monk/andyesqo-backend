import { PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDepotDto {
  /** e.g. Sydney Central */
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional() @IsString() address?: string;
  /** e.g. Zone 4 */
  @IsOptional() @IsString() zone?: string;

  /** Super admin only. */
  @IsOptional() @IsUUID() businessId?: string;
}

export class UpdateDepotDto extends PartialType(CreateDepotDto) {}

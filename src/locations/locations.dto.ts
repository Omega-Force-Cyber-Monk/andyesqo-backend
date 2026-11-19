import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class LocationUpdateDto {
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsOptional() @IsNumber() @Min(0) accuracy?: number;
  @IsDateString() recordedAt: string;
}

export class LocationHistoryQueryDto {
  @IsDateString() from: string;
  @IsDateString() to: string;
  @IsOptional() @IsUUID() businessId?: string;
  @IsOptional() @IsUUID() cursor?: string;
}

/** Buffered points uploaded together (e.g. after the app was offline). */
export class LocationBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LocationUpdateDto)
  points: LocationUpdateDto[];
}

export class LatestLocationsQueryDto {
  @IsOptional() @IsUUID() businessId?: string;
  /** Only drivers whose latest point is at most this old (minutes). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  maxAgeMinutes?: number;
}

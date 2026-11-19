import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SendMessageDto {
  @IsUUID() recipientId: string;
  @IsString() @IsNotEmpty() @MaxLength(4000) body: string;
  /** Optional delivery context (shown as "Location: ..." in the chat header). */
  @IsOptional() @IsUUID() deliveryId?: string;
}

export class ThreadQueryDto {
  /** Load messages older than this timestamp. */
  @IsOptional() @IsDateString() before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number =
    50;
}

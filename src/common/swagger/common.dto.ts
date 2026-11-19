import { ApiProperty } from '@nestjs/swagger';

/** Error body produced by AllExceptionsFilter for every failed request. */
export class ErrorResponse {
  @ApiProperty({ example: false })
  success!: false;
  @ApiProperty({ example: 400 })
  statusCode!: number;
  @ApiProperty({ example: 'Bad Request' })
  error!: string;
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['email must be an email'],
  })
  message!: string | string[];
  @ApiProperty({ example: '/api/v1/users' })
  path!: string;
  @ApiProperty({ format: 'date-time' })
  timestamp!: string;
}

/** Pagination block returned as `meta` by list endpoints. */
export class PageMeta {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 42 }) total!: number;
  @ApiProperty({ example: 3 }) totalPages!: number;
}

/** Generic acknowledgement for actions without a richer result. */
export class Ack {
  @ApiProperty({ required: false, example: true }) success?: boolean;
  @ApiProperty({ required: false, example: 'Done' }) message?: string;
}

/** `{ deleted: true }` style result. */
export class DeletedResult {
  @ApiProperty() id!: string;
  @ApiProperty({ example: true }) deleted!: boolean;
}

/** Count of rows affected by a bulk change. */
export class CountResult {
  @ApiProperty({ example: 3 }) count!: number;
}

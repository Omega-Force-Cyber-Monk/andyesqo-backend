import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiPublic } from '../swagger/swagger.js';

export const IS_PUBLIC_KEY = 'isPublic';
/** Skip the JWT guard for this route (and document it without security). */
export const Public = () =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), ApiPublic());

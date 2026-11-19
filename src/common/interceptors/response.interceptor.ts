import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator.js';

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

/**
 * Wraps every successful response as `{ success: true, data, meta? }`.
 * Services that return `{ items, meta }` (paginated lists) get `data = items`.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (raw) return next.handle();
    return next.handle().pipe(
      map((body: any): ApiResponse<unknown> => {
        if (
          body &&
          typeof body === 'object' &&
          'items' in body &&
          'meta' in body
        ) {
          return { success: true, data: body.items, meta: body.meta };
        }
        return { success: true, data: body ?? null };
      }),
    );
  }
}

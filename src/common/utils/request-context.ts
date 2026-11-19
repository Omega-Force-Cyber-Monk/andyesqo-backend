import { AsyncLocalStorage } from 'node:async_hooks';

/** Default business time zone (matches the Business.timezone column default). */
export const DEFAULT_TIME_ZONE = 'Australia/Sydney';

export interface RequestContext {
  /** IANA time zone of the caller's business; set by the JWT guard. */
  timeZone: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const currentTimeZone = () =>
  requestContext.getStore()?.timeZone ?? DEFAULT_TIME_ZONE;

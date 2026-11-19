import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'rawResponse';
/** Do not wrap the response in `{ success, data }` (used for CSV exports). */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);

import type { UserRole } from '../../generated/prisma/enums.js';

/** What the JWT guard puts on `request.user`. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  businessId: string | null;
  mfaVerified?: boolean;
  credentialVersion?: number;
  /** Refresh-token session the access token was issued for. */
  sessionId?: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  businessId: string | null;
  mfa?: boolean;
  credentialVersion: number;
  sid?: string;
}

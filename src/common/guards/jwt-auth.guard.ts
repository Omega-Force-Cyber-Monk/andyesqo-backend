import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthUser, JwtPayload } from '../types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BusinessStatus, UserStatus } from '../../generated/prisma/enums.js';
import { requestContext } from '../utils/request-context.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const [scheme, token] = header?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing bearer token');
    }
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        businessId: true,
        status: true,
        twoFactorEnabled: true,
        credentialVersion: true,
        mfaTotp: { select: { confirmed: true } },
        business: {
          select: { twoFactorRequired: true, status: true, timezone: true },
        },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }
    if (user.business?.status === BusinessStatus.INACTIVE) {
      throw new UnauthorizedException('This business has been archived');
    }
    if (payload.credentialVersion !== user.credentialVersion) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    if (
      (user.twoFactorEnabled ||
        user.mfaTotp?.confirmed ||
        user.business?.twoFactorRequired) &&
      payload.mfa !== true
    ) {
      throw new UnauthorizedException('Two-factor authentication required');
    }
    const actor: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
      mfaVerified: payload.mfa === true,
      credentialVersion: user.credentialVersion,
      sessionId: payload.sid,
    };
    req.user = actor;
    const store = requestContext.getStore();
    if (store && user.business?.timezone)
      store.timeZone = user.business.timezone;
    return true;
  }
}

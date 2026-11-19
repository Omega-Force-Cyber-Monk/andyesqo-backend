import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MfaService } from '@nestjs/authentication';
import {
  BusinessStatus,
  TokenType,
  UserStatus,
} from '../generated/prisma/enums.js';
import type { User } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.service.js';
import type { AuthUser, JwtPayload } from '../common/types/auth-user.js';
import { randomToken, sha256 } from '../common/utils/crypto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ActivateAccountDto,
  ChangePasswordDto,
  LoginDto,
  ResetPasswordDto,
} from './dto/auth.dto.js';
import { PasswordService } from './password.service.js';
import { UserTokensService } from './user-tokens.service.js';

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

const DAY = 24 * 60 * 60 * 1000;

export function publicUser(u: User) {
  const { passwordHash: _ignored, credentialVersion: _version, ...rest } = u;
  return rest;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly tokens: UserTokensService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
  ) {}

  private findByIdentifier(identifier: string) {
    const isEmail = identifier.includes('@');
    return isEmail
      ? this.prisma.user.findUnique({
          where: { email: identifier.toLowerCase() },
        })
      : this.prisma.user.findFirst({ where: { employeeId: identifier } });
  }

  async login(dto: LoginDto, client: ClientInfo) {
    const user = await this.findByIdentifier(dto.identifier);
    if (
      !user ||
      !user.passwordHash ||
      !(await this.passwords.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === UserStatus.PENDING_INVITE) {
      throw new ForbiddenException(
        'Please activate your account from the invitation email first',
      );
    }
    if (user.status === UserStatus.INACTIVE) {
      throw new ForbiddenException(
        'Your account is inactive. Contact your Business Administrator',
      );
    }
    const business = user.businessId
      ? await this.prisma.business.findUnique({
          where: { id: user.businessId },
          select: { twoFactorRequired: true, status: true },
        })
      : null;
    if (business?.status === BusinessStatus.INACTIVE)
      throw new ForbiddenException(
        'This business has been archived. Contact Andyesqo support',
      );
    const enrolled = await this.mfa.isEnrolled(user.id);
    if (user.twoFactorEnabled || enrolled || business?.twoFactorRequired) {
      const challenge = await this.createMfaChallenge(
        user.id,
        dto.rememberMe ?? false,
        user.credentialVersion,
      );
      return {
        mfaRequired: true,
        enrollmentRequired: !user.twoFactorEnabled && !enrolled,
        challenge,
      };
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: client.ip,
        lastLoginUserAgent: client.userAgent,
      },
    });
    return this.issueTokens(user, client, dto.rememberMe ?? false);
  }

  async refresh(refreshToken: string, client: ClientInfo) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: {
        user: {
          include: {
            business: { select: { twoFactorRequired: true, status: true } },
          },
        },
      },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.user.status !== UserStatus.ACTIVE)
      throw new ForbiddenException('Account is not active');
    if (record.user.business?.status === BusinessStatus.INACTIVE)
      throw new ForbiddenException('This business has been archived');
    if (record.credentialVersion !== record.user.credentialVersion)
      throw new UnauthorizedException('Session is no longer valid');
    const enrolled = await this.mfa.isEnrolled(record.user.id);
    if (
      (record.user.twoFactorEnabled ||
        enrolled ||
        record.user.business?.twoFactorRequired) &&
      !record.mfaVerified
    ) {
      throw new UnauthorizedException('Two-factor authentication required');
    }
    // Rotate: revoke the old one, issue a new pair with the same remaining lifetime class.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1)
      throw new UnauthorizedException('Invalid refresh token');
    const remember =
      record.expiresAt.getTime() - record.createdAt.getTime() > 8 * DAY;
    return this.issueTokens(record.user, client, remember, record.mfaVerified);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { loggedOut: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { business: true, depot: true },
    });
    return publicUser(user);
  }

  async forgotPassword(identifier: string) {
    const user = await this.findByIdentifier(identifier.trim());
    let devToken: string | undefined;
    if (user && user.status !== UserStatus.INACTIVE) {
      devToken = await this.tokens.sendPasswordReset(user);
    }
    // Same answer whether or not the account exists.
    return {
      message: 'If the account exists, a reset link has been sent',
      devToken,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.newPassword !== dto.confirmPassword)
      throw new BadRequestException('Passwords do not match');
    const userId = await this.tokens.consume(
      dto.token,
      TokenType.PASSWORD_RESET,
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.passwords.hash(dto.newPassword),
        credentialVersion: { increment: 1 },
      },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.mfaChallenge.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    return { message: 'Password updated successfully' };
  }

  async activate(dto: ActivateAccountDto) {
    if (dto.password !== dto.confirmPassword)
      throw new BadRequestException('Passwords do not match');
    const userId = await this.tokens.consume(dto.token, TokenType.INVITATION);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash: await this.passwords.hash(dto.password),
        status: UserStatus.ACTIVE,
      },
    });
    await this.audit.log(null, {
      businessId: user.businessId,
      action: 'Account Activated',
      module: 'Users & Permissions',
      targetType: 'User',
      targetId: user.id,
      details: `${user.email} activated their account`,
    });
    return {
      message: 'Account activated successfully',
      user: publicUser(user),
    };
  }

  async changePassword(actor: AuthUser, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword)
      throw new BadRequestException('Passwords do not match');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
    });
    if (
      !user.passwordHash ||
      !(await this.passwords.compare(dto.currentPassword, user.passwordHash))
    ) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await this.passwords.hash(dto.newPassword),
        credentialVersion: { increment: 1 },
      },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.mfaChallenge.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return { message: 'Password changed successfully' };
  }

  private async createMfaChallenge(
    userId: string,
    remember: boolean,
    credentialVersion: number,
  ) {
    const challenge = randomToken();
    await this.prisma.mfaChallenge.deleteMany({
      where: { userId, expiresAt: { lte: new Date() } },
    });
    await this.prisma.mfaChallenge.create({
      data: {
        userId,
        tokenHash: sha256(challenge),
        remember,
        credentialVersion,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return challenge;
  }

  private async getMfaChallenge(challenge: string) {
    const record = await this.prisma.mfaChallenge.findUnique({
      where: { tokenHash: sha256(challenge) },
      include: { user: true },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt <= new Date() ||
      record.user.status !== UserStatus.ACTIVE ||
      record.credentialVersion !== record.user.credentialVersion
    )
      throw new UnauthorizedException(
        'Invalid or expired authentication challenge',
      );
    return record;
  }

  /**
   * Administrator resets are serialized by a row lock and a credential version
   * bump, but MFA library writes run outside that transaction. If a reset lands
   * while an enrollment, verification or replacement is in flight, remove the
   * exact authenticator that stale step wrote so the reset always wins.
   */
  private async undoIfReset(
    userId: string,
    started: Date,
    written: { secret: string; pendingSecret: string | null } | null,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaResetAt: true },
    });
    if (!user?.mfaResetAt || user.mfaResetAt < started) return false;
    if (written)
      await this.prisma.mfaTotp.deleteMany({
        where: {
          userId,
          secret: written.secret,
          pendingSecret: written.pendingSecret,
        },
      });
    return true;
  }

  private snapshotTotp(userId: string) {
    return this.prisma.mfaTotp.findUnique({
      where: { userId },
      select: { secret: true, pendingSecret: true },
    });
  }

  async mfaSetup(actor: AuthUser, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
    });
    if (
      user.twoFactorEnabled ||
      !user.passwordHash ||
      !(await this.passwords.compare(password, user.passwordHash))
    )
      throw new UnauthorizedException('Cannot start authenticator setup');
    const challenge = await this.createMfaChallenge(
      user.id,
      false,
      user.credentialVersion,
    );
    return { challenge, ...(await this.mfaEnroll(challenge)) };
  }

  async mfaEnroll(challenge: string) {
    const started = new Date();
    const record = await this.getMfaChallenge(challenge);
    if (
      record.user.twoFactorEnabled ||
      (await this.mfa.isEnrolled(record.userId))
    )
      throw new ForbiddenException('Authenticator already enrolled');
    const enrollment = await this.mfa.enroll(record.userId, record.user.email);
    if (
      await this.undoIfReset(
        record.userId,
        started,
        await this.snapshotTotp(record.userId),
      )
    )
      throw new UnauthorizedException(
        'Invalid or expired authentication challenge',
      );
    return enrollment;
  }

  async mfaRecoveryCodes(actor: AuthUser) {
    if (!actor.mfaVerified || !(await this.mfa.isEnrolled(actor.id))) {
      throw new ForbiddenException(
        'A two-factor authenticated session is required',
      );
    }
    return { recoveryCodes: await this.mfa.generateRecoveryCodes(actor.id) };
  }

  async mfaReplace(
    actor: AuthUser,
    password: string,
    code?: string,
    recoveryCode?: string,
  ) {
    const started = new Date();
    if (!actor.mfaVerified || !!code === !!recoveryCode)
      throw new ForbiddenException(
        'A two-factor authenticated session and one current code are required',
      );
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
    });
    if (
      actor.credentialVersion !== user.credentialVersion ||
      !user.passwordHash ||
      !(await this.passwords.compare(password, user.passwordHash)) ||
      !(await this.mfa.isEnrolled(user.id))
    ) {
      throw new UnauthorizedException('Cannot replace authenticator');
    }
    const valid = recoveryCode
      ? await this.mfa.verifyRecoveryCode(user.id, recoveryCode)
      : await this.mfa.verifyTotp(user.id, code!);
    if (!valid) throw new UnauthorizedException('Invalid authenticator code');
    const enrollment = await this.mfa.enroll(user.id, user.email, {
      replace: true,
    });
    if (
      await this.undoIfReset(user.id, started, await this.snapshotTotp(user.id))
    )
      throw new UnauthorizedException('Cannot replace authenticator');
    return enrollment;
  }

  async mfaConfirmReplacement(
    actor: AuthUser,
    code: string,
    client: ClientInfo,
  ) {
    const started = new Date();
    if (!actor.mfaVerified)
      throw new ForbiddenException(
        'A two-factor authenticated session is required',
      );
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
    });
    if (
      actor.credentialVersion !== user.credentialVersion ||
      !(await this.mfa.confirm(user.id, code))
    ) {
      throw new UnauthorizedException('Invalid authenticator code');
    }
    const confirmed = await this.snapshotTotp(user.id);
    const updated = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        status: UserStatus.ACTIVE,
        credentialVersion: user.credentialVersion,
      },
      data: { credentialVersion: { increment: 1 } },
    });
    if (
      updated.count !== 1 ||
      (await this.undoIfReset(user.id, started, null))
    ) {
      await this.undoIfReset(user.id, started, confirmed);
      throw new UnauthorizedException('Session is no longer valid');
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.mfaChallenge.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return this.issueTokens(
      { ...user, credentialVersion: user.credentialVersion + 1 },
      client,
      false,
      true,
    );
  }

  async mfaVerify(
    challenge: string,
    code: string | undefined,
    recoveryCode: string | undefined,
    client: ClientInfo,
  ) {
    const started = new Date();
    if (!!code === !!recoveryCode)
      throw new BadRequestException(
        'Provide exactly one authenticator or recovery code',
      );
    const record = await this.getMfaChallenge(challenge);
    const enrolled = await this.mfa.isEnrolled(record.userId);
    if (record.user.twoFactorEnabled && !enrolled)
      throw new UnauthorizedException('Authenticator unavailable');
    const valid = recoveryCode
      ? enrolled &&
        (await this.mfa.verifyRecoveryCode(record.userId, recoveryCode))
      : enrolled
        ? await this.mfa.verifyTotp(record.userId, code!)
        : await this.mfa.confirm(record.userId, code!);
    if (!valid) throw new UnauthorizedException('Invalid authenticator code');
    // Snapshot what an initial enrollment just confirmed, for undoIfReset.
    const confirmed = enrolled ? null : await this.snapshotTotp(record.userId);
    const consumed = await this.prisma.mfaChallenge.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1)
      throw new UnauthorizedException(
        'Invalid or expired authentication challenge',
      );
    const updated = await this.prisma.user.updateMany({
      where: {
        id: record.userId,
        status: UserStatus.ACTIVE,
        credentialVersion: record.credentialVersion,
      },
      data: {
        twoFactorEnabled: true,
        lastLoginAt: new Date(),
        lastLoginIp: client.ip,
        lastLoginUserAgent: client.userAgent,
      },
    });
    if (updated.count !== 1) {
      await this.undoIfReset(record.userId, started, confirmed);
      throw new UnauthorizedException(
        'Authentication challenge is no longer valid',
      );
    }
    return this.issueTokens(
      { ...record.user, twoFactorEnabled: true },
      client,
      record.remember,
      true,
    );
  }

  private async issueTokens(
    user: User,
    client: ClientInfo,
    remember: boolean,
    mfa = false,
  ) {
    const refreshToken = randomToken();
    const days = remember
      ? (this.config.get<number>('REFRESH_TOKEN_REMEMBER_TTL_DAYS') ?? 30)
      : (this.config.get<number>('REFRESH_TOKEN_TTL_DAYS') ?? 7);
    const session = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        mfaVerified: mfa,
        credentialVersion: user.credentialVersion,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + days * DAY),
        ip: client.ip,
        userAgent: client.userAgent,
      },
    });
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
      mfa,
      credentialVersion: user.credentialVersion,
      sid: session.id,
    };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
      user: publicUser(user),
    };
  }

  /** "Active Security Session": signed-in devices with IP, browser and time. */
  async sessions(actor: AuthUser) {
    const rows = await this.prisma.refreshToken.findMany({
      where: {
        userId: actor.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        credentialVersion: actor.credentialVersion,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
        mfaVerified: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      lastAuthenticatedAt: r.createdAt,
      current: r.id === actor.sessionId,
    }));
  }

  /** Signs out one device (its access token lapses within its short lifetime). */
  async revokeSession(actor: AuthUser, id: string) {
    const res = await this.prisma.refreshToken.updateMany({
      where: { id, userId: actor.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!res.count) throw new NotFoundException('Session not found');
    await this.audit.log(actor, {
      businessId: actor.businessId,
      action: 'Session Revoked',
      module: 'Security',
      targetType: 'User',
      targetId: actor.id,
    });
    return { revoked: true };
  }

  /** Signs out everywhere, immediately, including this device. */
  async revokeAllSessions(actor: AuthUser) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: actor.id },
        data: { credentialVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: actor.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.mfaChallenge.updateMany({
        where: { userId: actor.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
    await this.audit.log(actor, {
      businessId: actor.businessId,
      action: 'All Sessions Revoked',
      module: 'Security',
      targetType: 'User',
      targetId: actor.id,
    });
    return { revoked: true };
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { AuthService, ClientInfo } from './auth.service.js';
import {
  ActivateAccountDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
  MfaChallengeDto,
  MfaVerifyDto,
  MfaSetupDto,
  MfaReplaceDto,
  MfaCodeDto,
} from './dto/auth.dto.js';
import { ApiData } from '../common/swagger/swagger.js';
import { UserModel } from '../common/swagger/entities.dto.js';
import {
  ActivationResult,
  LoggedOut,
  MfaChallengeResult,
  MessageResult,
  MfaEnrollment,
  MfaSetupResult,
  RecoveryCodes,
  Revoked,
  SessionInfo,
  TokenPair,
} from '../common/swagger/responses.dto.js';

const client = (req: Request): ClientInfo => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

@ApiTags('Auth')
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in with email or Employee ID + password' })
  @ApiExtraModels(TokenPair, MfaChallengeResult)
  @ApiData({
    oneOf: [
      { $ref: getSchemaPath(TokenPair) },
      { $ref: getSchemaPath(MfaChallengeResult) },
    ],
  })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, client(req));
  }

  @Public()
  @Post('mfa/enroll')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Start first authenticator enrollment from a login challenge',
  })
  @ApiData(MfaEnrollment)
  enroll(@Body() dto: MfaChallengeDto) {
    return this.auth.mfaEnroll(dto.challenge);
  }

  @Public()
  @Post('mfa/verify')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Verify a TOTP or recovery code for a challenge and receive tokens',
  })
  @ApiData(TokenPair)
  verifyMfa(@Body() dto: MfaVerifyDto, @Req() req: Request) {
    return this.auth.mfaVerify(
      dto.challenge,
      dto.code,
      dto.recoveryCode,
      client(req),
    );
  }

  @ApiBearerAuth()
  @Post('mfa/setup')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Start optional authenticator enrollment (password required)',
  })
  @ApiData(MfaSetupResult)
  setupMfa(@CurrentUser() user: AuthUser, @Body() dto: MfaSetupDto) {
    return this.auth.mfaSetup(user, dto.password);
  }

  @ApiBearerAuth()
  @Post('mfa/recovery-codes')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Generate one-time recovery codes (replaces previous codes)',
  })
  @ApiData(RecoveryCodes)
  recoveryCodes(@CurrentUser() user: AuthUser) {
    return this.auth.mfaRecoveryCodes(user);
  }

  @ApiBearerAuth()
  @Post('mfa/replace')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Start authenticator replacement (password and current code required)',
  })
  @ApiData(MfaEnrollment)
  replaceMfa(@CurrentUser() user: AuthUser, @Body() dto: MfaReplaceDto) {
    return this.auth.mfaReplace(user, dto.password, dto.code, dto.recoveryCode);
  }

  @ApiBearerAuth()
  @Post('mfa/replace/confirm')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Confirm the new authenticator; returns a fresh token pair',
  })
  @ApiData(TokenPair)
  confirmMfaReplacement(
    @CurrentUser() user: AuthUser,
    @Body() dto: MfaCodeDto,
    @Req() req: Request,
  ) {
    return this.auth.mfaConfirmReplacement(user, dto.code, client(req));
  }

  @Public()
  @Post('refresh')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Rotate the refresh token and get a new access token',
  })
  @ApiData(TokenPair)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, client(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log out (revoke the refresh token)' })
  @ApiData(LoggedOut)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send a password reset link (Forgot Password screen)',
  })
  @ApiData(MessageResult)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.identifier);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create New Password from the reset link' })
  @ApiData(MessageResult)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Public()
  @Post('activate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set Up Your Account from the invitation link' })
  @ApiData(ActivationResult)
  activate(@Body() dto: ActivateAccountDto) {
    return this.auth.activate(dto);
  }

  @ApiBearerAuth()
  @SkipThrottle()
  @Get('me')
  @ApiOperation({ summary: 'Current user' })
  @ApiData(UserModel)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @ApiBearerAuth()
  @SkipThrottle()
  @Get('sessions')
  @ApiOperation({
    summary: 'Active sessions (IP address, browser, last authenticated)',
  })
  @ApiData([SessionInfo])
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.sessions(user);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Sign out one session' })
  @ApiData(Revoked)
  revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auth.revokeSession(user, id);
  }

  @ApiBearerAuth()
  @Delete('sessions')
  @ApiOperation({ summary: 'Sign out of every session, including this one' })
  @ApiData(Revoked)
  revokeAllSessions(@CurrentUser() user: AuthUser) {
    return this.auth.revokeAllSessions(user);
  }

  @ApiBearerAuth()
  @Patch('change-password')
  @ApiOperation({ summary: 'Change password (settings / profile screens)' })
  @ApiData(MessageResult)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user, dto);
  }
}

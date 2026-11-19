import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthenticationStorage, MfaService } from '@nestjs/authentication';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { UserTokensService } from './user-tokens.service.js';
import { PrismaMfaStore } from './mfa.store.js';

@Global()
@Module({
  imports: [
    // Per client IP and endpoint, for the auth controller only.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: 60_000,
          limit: Number(
            process.env.AUTH_RATE_LIMIT ??
              config.get<number>('AUTH_RATE_LIMIT') ??
              10,
          ),
        },
      ],
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_EXPIRES_IN') ?? '15m',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    UserTokensService,
    PrismaMfaStore,
    {
      provide: MfaService,
      inject: [PrismaMfaStore, ConfigService],
      useFactory: (store: PrismaMfaStore, config: ConfigService) => {
        const storage = new AuthenticationStorage();
        storage.registerSource({ mfa: store });
        return new MfaService(storage, {
          mfa: {
            issuer: 'Andyesqo',
            encryption: {
              keys: [config.getOrThrow<string>('TOTP_ENCRYPTION_KEY')],
            },
          },
        });
      },
    },
  ],
  exports: [PasswordService, UserTokensService],
})
export class AuthModule {}

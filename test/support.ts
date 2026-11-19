import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter.js';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor.js';
import {
  PermissionModule,
  UserRole,
  UserStatus,
} from './../src/generated/prisma/enums.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

export async function createTestApp() {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

type Access = 'view' | 'edit';

/** An isolated tenant with helpers to create users, grant matrix rows and call the API. */
export class Tenant {
  readonly suffix = randomUUID().slice(0, 8);
  businessId!: string;
  private constructor(private readonly app: INestApplication<App>) {}

  static async create(app: INestApplication<App>, name = 'Tenant') {
    const t = new Tenant(app);
    const business = await t.prisma.business.create({
      data: { name: `${name} ${t.suffix}` },
    });
    t.businessId = business.id;
    return t;
  }

  get prisma() {
    return this.app.get(PrismaService);
  }

  http() {
    return request(this.app.getHttpServer());
  }

  async depot(name: string) {
    return this.prisma.depot.create({
      data: { businessId: this.businessId, name: `${name} ${this.suffix}` },
    });
  }

  async user(
    role: UserRole,
    extra: { depotId?: string; employeeId?: string; firstName?: string } = {},
  ) {
    const id = randomUUID().slice(0, 8);
    return this.prisma.user.create({
      data: {
        businessId: this.businessId,
        firstName: extra.firstName ?? role,
        email: `${role.toLowerCase()}-${id}-${this.suffix}@example.com`,
        role,
        status: UserStatus.ACTIVE,
        depotId: extra.depotId,
        employeeId: extra.employeeId,
        passwordHash: await hash('Password123', 4),
      },
    });
  }

  /** Gives a driver/assistant the licence, visa and documents needed to be rostered. */
  async compliant(userId: string) {
    const expiresAt = new Date(Date.now() + 365 * 86400000);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        licenceNumber: 'L1',
        licenceExpiry: expiresAt,
        visaStatus: 'Citizen',
        documents: {
          create: (
            ['TRAINING', 'MEDICAL_CERTIFICATE', 'POLICE_CHECK'] as const
          ).map((type) => ({ type, title: type, expiresAt })),
        },
      },
    });
  }

  /** Replaces the built-in role's matrix with exactly these rows. */
  async grant(role: UserRole, rows: Partial<Record<PermissionModule, Access>>) {
    await this.prisma.roleDefinition.deleteMany({
      where: { businessId: this.businessId, key: role, isSystem: true },
    });
    await this.prisma.roleDefinition.create({
      data: {
        businessId: this.businessId,
        key: role,
        name: role,
        isSystem: true,
        permissions: {
          create: Object.entries(rows).map(([module, a]) => ({
            module: module as PermissionModule,
            canView: true,
            canEdit: a === 'edit',
          })),
        },
      },
    });
  }

  async scope(userId: string, depotIds: string[]) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        allDepots: false,
        depotScopes: { create: depotIds.map((depotId) => ({ depotId })) },
      },
    });
  }

  async token(user: { email: string | null }) {
    const res = await this.http()
      .post('/api/v1/auth/login')
      .send({ identifier: user.email, password: 'Password123' })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  async vehicle(
    depotId: string | null,
    extra: { assignedDriverId?: string } = {},
  ) {
    const id = randomUUID().slice(0, 6);
    return this.prisma.vehicle.create({
      data: {
        businessId: this.businessId,
        depotId,
        code: `VH-${id}`,
        registration: `R${id}`.toUpperCase(),
        model: 'Van',
        ...extra,
      },
    });
  }

  async destroy() {
    await this.prisma.business.deleteMany({ where: { id: this.businessId } });
  }
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** RFC 6238 code for a base32 secret (offset in 30-second steps). */
export function totp(secret: string, offset = 0) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret)
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = Buffer.from(
    bits.match(/.{8}/g)!.map((part) => parseInt(part, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const digest = createHmac('sha1', bytes).update(counter).digest();
  const o = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(
    6,
    '0',
  );
}

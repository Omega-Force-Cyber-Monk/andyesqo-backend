import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  ComplianceDocumentType,
  ShiftStatus,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums.js';
import { publicUser } from '../auth/auth.service.js';
import { AccessService } from '../common/access/access.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { toCsv } from '../common/utils/csv.js';
import {
  businessFilter,
  localDate,
  todayRange,
} from '../common/utils/tenant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  COMPLIANCE_RULES,
  expiryStatus,
  ItemStatus,
  worst,
} from './compliance.rules.js';
import {
  ComplianceQueryDto,
  CreateDocumentDto,
  UpdateDocumentDto,
} from './dto/compliance.dto.js';

const userInclude = {
  documents: true,
  depot: { select: { id: true, name: true } },
} satisfies Prisma.UserInclude;
type UserWithDocs = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export interface ComplianceResult {
  licence: ItemStatus;
  visa: ItemStatus;
  training: ItemStatus;
  documents: ItemStatus;
  fatigue: {
    status: 'WITHIN_LIMITS' | 'EXCEEDED';
    todayHours: number;
    weeklyHours: number;
    dailyLimit: number;
    weeklyLimit: number;
    remainingToday: number;
  };
  overall: 'COMPLIANT' | 'REVIEW' | 'NON_COMPLIANT';
  eligible: boolean;
  issues: string[];
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  /** People whose compliance the actor may see: business, depot scope, field crew for non-admins. */
  private async subjectWhere(
    actor: AuthUser,
    businessId?: string,
  ): Promise<Prisma.UserWhereInput> {
    const admin =
      actor.role === UserRole.BUSINESS_ADMIN ||
      actor.role === UserRole.SUPER_ADMIN;
    return {
      ...businessFilter(actor, businessId),
      ...(await this.access.depotWhere(actor)),
      role: admin
        ? { not: UserRole.SUPER_ADMIN }
        : { in: [UserRole.DRIVER, UserRole.ASSISTANT] },
    };
  }

  /** Hours worked today and in the last 7 days per user (from clock in/out). */
  async hoursFor(userIds: string[]) {
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const today = todayRange().gte;
    const rows = await this.prisma.attendance.findMany({
      where: { userId: { in: userIds }, clockInAt: { gte: weekAgo } },
    });
    const out = new Map<string, { today: number; week: number }>();
    for (const r of rows) {
      if (!r.clockInAt) continue;
      const h =
        ((r.clockOutAt ?? new Date()).getTime() - r.clockInAt.getTime()) /
        3600000;
      const cur = out.get(r.userId) ?? { today: 0, week: 0 };
      cur.week += h;
      if (r.clockInAt >= today) cur.today += h;
      out.set(r.userId, cur);
    }
    return out;
  }

  evaluate(u: UserWithDocs, hours = { today: 0, week: 0 }): ComplianceResult {
    const docs = (t: ComplianceDocumentType) =>
      u.documents.filter((d) => d.type === t);
    const issues: string[] = [];

    const licenceDoc = docs(ComplianceDocumentType.DRIVER_LICENCE)[0];
    const licence =
      u.role === UserRole.DRIVER
        ? expiryStatus(u.licenceExpiry ?? licenceDoc?.expiresAt)
        : ('NOT_APPLICABLE' as ItemStatus);

    const visa: ItemStatus =
      u.visaStatus?.toLowerCase() === 'citizen' ||
      u.visaStatus?.toLowerCase() === 'permanent resident'
        ? 'VALID'
        : expiryStatus(
            u.visaExpiry ?? docs(ComplianceDocumentType.VISA)[0]?.expiresAt,
          );

    const trainingDocs = docs(ComplianceDocumentType.TRAINING);
    const training = trainingDocs.length
      ? worst(
          trainingDocs.map((d) =>
            expiryStatus(d.expiresAt ?? new Date(8.64e15)),
          ),
        )
      : 'MISSING';

    const documents = worst(
      COMPLIANCE_RULES.requiredDocuments.map((t) => {
        const d = docs(t)[0];
        return d ? expiryStatus(d.expiresAt ?? new Date(8.64e15)) : 'MISSING';
      }),
    );

    const exceeded =
      hours.today > COMPLIANCE_RULES.dailyHoursLimit ||
      hours.week > COMPLIANCE_RULES.weeklyHoursLimit;
    const fatigue = {
      status: exceeded ? ('EXCEEDED' as const) : ('WITHIN_LIMITS' as const),
      todayHours: Math.round(hours.today * 10) / 10,
      weeklyHours: Math.round(hours.week * 10) / 10,
      dailyLimit: COMPLIANCE_RULES.dailyHoursLimit,
      weeklyLimit: COMPLIANCE_RULES.weeklyHoursLimit,
      remainingToday: Math.max(
        0,
        Math.round((COMPLIANCE_RULES.dailyHoursLimit - hours.today) * 10) / 10,
      ),
    };

    const named: [string, ItemStatus][] = [
      ['Licence', licence],
      ['Visa', visa],
      ['Training', training],
      ['Documents', documents],
    ];
    for (const [n, s] of named) {
      if (s === 'EXPIRED') issues.push(`${n} expired`);
      if (s === 'MISSING') issues.push(`${n} missing`);
      if (s === 'EXPIRING') issues.push(`${n} expiring soon`);
    }
    if (exceeded) issues.push('Fatigue limit exceeded');

    const blocking =
      licence === 'EXPIRED' ||
      licence === 'MISSING' ||
      visa === 'EXPIRED' ||
      documents === 'EXPIRED' ||
      exceeded;
    const review = !blocking && issues.length > 0;
    return {
      licence,
      visa,
      training,
      documents,
      fatigue,
      overall: blocking ? 'NON_COMPLIANT' : review ? 'REVIEW' : 'COMPLIANT',
      eligible: !blocking,
      issues,
    };
  }

  /** Compliance for many users at once (used by roster and availability). */
  async evaluateMany(userIds: string[]) {
    const [users, hours] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        include: userInclude,
      }),
      this.hoursFor(userIds),
    ]);
    return new Map(users.map((u) => [u.id, this.evaluate(u, hours.get(u.id))]));
  }

  private async baseWhere(
    actor: AuthUser,
    q: ComplianceQueryDto,
  ): Promise<Prisma.UserWhereInput> {
    return {
      AND: [
        await this.subjectWhere(actor, q.businessId),
        { role: q.role ?? { in: [UserRole.DRIVER, UserRole.ASSISTANT] } },
      ],
      status: { not: UserStatus.INACTIVE },
      ...(q.search && {
        OR: [
          { firstName: { contains: q.search, mode: 'insensitive' } },
          { lastName: { contains: q.search, mode: 'insensitive' } },
          { employeeId: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };
  }

  private async rows(actor: AuthUser, q: ComplianceQueryDto) {
    const users = await this.prisma.user.findMany({
      where: await this.baseWhere(actor, q),
      include: userInclude,
      orderBy: { employeeId: 'asc' },
    });
    const hours = await this.hoursFor(users.map((u) => u.id));
    const today = localDate();
    const rostered = new Set(
      (
        await this.prisma.shift.findMany({
          where: {
            date: today,
            status: { not: ShiftStatus.CANCELLED },
            OR: [
              { driverId: { in: users.map((u) => u.id) } },
              { assistantId: { in: users.map((u) => u.id) } },
            ],
          },
          select: { driverId: true, assistantId: true },
        })
      ).flatMap((s) => [s.driverId, s.assistantId]),
    );
    return users
      .map((u) => {
        const { documents: _d, ...user } = publicUser(u) as UserWithDocs;
        return {
          user,
          compliance: this.evaluate(u, hours.get(u.id)),
          rosteredToday: rostered.has(u.id),
        };
      })
      .filter((r) => (q.status ? r.compliance.overall === q.status : true))
      .filter((r) =>
        q.eligibility
          ? (q.eligibility === 'ELIGIBLE') === r.compliance.eligible
          : true,
      );
  }

  /** Compliance table (roster manager / admin). */
  async findAll(actor: AuthUser, q: ComplianceQueryDto) {
    const { skip, take, page, limit } = paginate(q);
    const all = await this.rows(actor, q);
    return pageResult(all.slice(skip, skip + take), all.length, page, limit);
  }

  async exportCsv(actor: AuthUser, q: ComplianceQueryDto) {
    const all = await this.rows(actor, q);
    return toCsv(
      all.map(({ user, compliance }) => ({
        employeeId: user.employeeId,
        name: `${user.firstName} ${user.lastName ?? ''}`.trim(),
        role: user.role,
        licence: compliance.licence,
        visa: compliance.visa,
        training: compliance.training,
        documents: compliance.documents,
        fatigue: compliance.fatigue.status,
        overall: compliance.overall,
        eligible: compliance.eligible ? 'Eligible' : 'Not Eligible',
      })),
    );
  }

  /** "view details" drawer: profile, licence, visa, training, documents, fatigue, eligibility. */
  async detail(actor: AuthUser, userId: string) {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, ...(await this.subjectWhere(actor)) },
      include: userInclude,
    });
    if (!u) throw new NotFoundException('User not found');
    const hours = await this.hoursFor([u.id]);
    const by = (t: ComplianceDocumentType) =>
      u.documents.filter((d) => d.type === t);
    return {
      user: publicUser(u),
      compliance: this.evaluate(u, hours.get(u.id)),
      licence: {
        class: u.licenceClass,
        number: u.licenceNumber,
        expiry: u.licenceExpiry,
      },
      visa: { status: u.visaStatus, expiry: u.visaExpiry },
      training: by(ComplianceDocumentType.TRAINING),
      documents: u.documents.filter(
        (d) => d.type !== ComplianceDocumentType.TRAINING,
      ),
    };
  }

  /** "Compliance Requires Attention" (licences expiring, missing documents). */
  async alerts(actor: AuthUser, businessId?: string) {
    const all = await this.rows(actor, { businessId } as ComplianceQueryDto);
    return all
      .filter((r) => r.compliance.issues.length > 0)
      .map((r) => ({
        user: r.user,
        issues: r.compliance.issues,
        overall: r.compliance.overall,
      }));
  }

  // ── Documents ──
  async documents(actor: AuthUser, userId: string) {
    await this.ensureUser(actor, userId);
    return this.prisma.complianceDocument.findMany({
      where: { userId },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async addDocument(actor: AuthUser, userId: string, dto: CreateDocumentDto) {
    const u = await this.ensureUser(actor, userId);
    const doc = await this.prisma.complianceDocument.create({
      data: {
        ...dto,
        userId,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
    await this.syncUserFields(userId, doc.type, doc.number, doc.expiresAt);
    await this.audit.log(actor, {
      businessId: u.businessId,
      action: 'Compliance Document Added',
      module: 'Compliance',
      targetType: 'User',
      targetId: userId,
      details: `${doc.title} for ${u.firstName}`,
    });
    return doc;
  }

  async updateDocument(actor: AuthUser, docId: string, dto: UpdateDocumentDto) {
    const doc = await this.prisma.complianceDocument.findFirst({
      where: { id: docId, user: await this.subjectWhere(actor) },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const updated = await this.prisma.complianceDocument.update({
      where: { id: docId },
      data: {
        ...dto,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
    await this.syncUserFields(
      doc.userId,
      updated.type,
      updated.number,
      updated.expiresAt,
    );
    await this.audit.log(actor, {
      businessId: (await this.ensureUser(actor, doc.userId)).businessId,
      action: 'Compliance Document Updated',
      module: 'Compliance',
      targetType: 'User',
      targetId: doc.userId,
      details: updated.title,
    });
    return updated;
  }

  async removeDocument(actor: AuthUser, docId: string) {
    const doc = await this.prisma.complianceDocument.findFirst({
      where: { id: docId, user: await this.subjectWhere(actor) },
      include: { user: { select: { businessId: true } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const removed = await this.prisma.complianceDocument.delete({
      where: { id: docId },
    });
    await this.audit.log(actor, {
      businessId: doc.user.businessId,
      action: 'Compliance Document Removed',
      module: 'Compliance',
      targetType: 'User',
      targetId: doc.userId,
      details: doc.title,
    });
    return removed;
  }

  /** Keep the quick-access licence/visa fields on User in sync with the uploaded documents. */
  private async syncUserFields(
    userId: string,
    type: ComplianceDocumentType,
    number: string | null,
    expiresAt: Date | null,
  ) {
    if (type === ComplianceDocumentType.DRIVER_LICENCE) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { licenceNumber: number ?? undefined, licenceExpiry: expiresAt },
      });
    }
    if (type === ComplianceDocumentType.VISA) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { visaExpiry: expiresAt },
      });
    }
  }

  private async ensureUser(actor: AuthUser, userId: string) {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, ...(await this.subjectWhere(actor)) },
    });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }
}

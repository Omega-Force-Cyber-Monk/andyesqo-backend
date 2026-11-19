import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  IncidentStatus,
  NotificationType,
  ShiftStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { AccessService } from '../common/access/access.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import { NotifyService } from '../common/notify/notify.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import {
  businessFilter,
  businessIdOf,
  localDate,
} from '../common/utils/tenant.js';
import { DeliveriesService } from '../deliveries/deliveries.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateIncidentDto, IncidentQueryDto } from './dto/incident.dto.js';

const include = {
  incidentType: true,
  delivery: { select: { id: true, code: true, customerName: true } },
  vehicle: { select: { id: true, registration: true, model: true } },
  reportedBy: {
    select: { id: true, firstName: true, lastName: true, employeeId: true },
  },
} satisfies Prisma.IncidentReportInclude;

/** Incident review workflow: submitted → under review → resolved (reopen allowed). */
export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  SUBMITTED: [IncidentStatus.UNDER_REVIEW, IncidentStatus.RESOLVED],
  UNDER_REVIEW: [IncidentStatus.RESOLVED, IncidentStatus.SUBMITTED],
  RESOLVED: [IncidentStatus.UNDER_REVIEW],
};

const isField = (actor: AuthUser) =>
  actor.role === UserRole.DRIVER || actor.role === UserRole.ASSISTANT;

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly deliveries: DeliveriesService,
  ) {}

  /** Field users see their own reports; managers see reports within their depot scope. */
  private async where(
    actor: AuthUser,
    businessId?: string,
  ): Promise<Prisma.IncidentReportWhereInput> {
    return {
      reportedBy: {
        ...businessFilter(actor, businessId),
        ...(await this.access.depotWhere(actor)),
      },
      ...(isField(actor) && { reportedById: actor.id }),
    };
  }

  async create(actor: AuthUser, dto: CreateIncidentDto) {
    const businessId = businessIdOf(actor);
    const type = await this.prisma.incidentType.findFirst({
      where: { id: dto.incidentTypeId, businessId, active: true },
    });
    if (!type) throw new NotFoundException('Incident type not found');
    let vehicleId = dto.vehicleId;
    if (dto.deliveryId) {
      const d = await this.prisma.delivery.findFirst({
        where: {
          id: dto.deliveryId,
          businessId,
          AND: [await this.deliveries.scope(actor)],
        },
      });
      if (!d) throw new NotFoundException('Delivery not found');
      if (vehicleId && d.vehicleId && vehicleId !== d.vehicleId)
        throw new BadRequestException(
          'Vehicle does not match the delivery vehicle',
        );
      vehicleId = vehicleId ?? d.vehicleId ?? undefined;
    }
    if (dto.vehicleId) {
      // Field users may only reference a vehicle assigned to them or on today's shift.
      const vehicle = await this.prisma.vehicle.findFirst({
        where: {
          id: dto.vehicleId,
          businessId,
          ...(isField(actor) && {
            OR: [
              { assignedDriverId: actor.id },
              {
                shifts: {
                  some: {
                    date: localDate(),
                    status: {
                      in: [
                        ShiftStatus.PUBLISHED,
                        ShiftStatus.IN_PROGRESS,
                        ShiftStatus.COMPLETED,
                      ],
                    },
                    OR: [{ driverId: actor.id }, { assistantId: actor.id }],
                  },
                },
              },
              ...(dto.deliveryId
                ? [{ deliveries: { some: { id: dto.deliveryId } } }]
                : []),
            ],
          }),
        },
        select: { id: true },
      });
      if (!vehicle) throw new NotFoundException('Vehicle not found');
    }
    const incident = await this.prisma.incidentReport.create({
      data: {
        ...dto,
        vehicleId,
        photos: dto.photos ?? [],
        reportedById: actor.id,
      },
      include,
    });
    await this.notify.toRoles(
      businessId,
      type.requiresSupervisorReview
        ? [UserRole.SUPERVISOR, UserRole.BUSINESS_ADMIN]
        : [UserRole.SUPERVISOR],
      NotificationType.DELIVERY,
      `Incident: ${type.name}`,
      dto.description,
      {
        incidentId: incident.id,
        requiresPoliceReport: type.requiresPoliceReport,
        requiresSafeWorkNotice: type.requiresSafeWorkNotice,
      },
    );
    await this.audit.log(actor, {
      businessId,
      action: 'Incident Reported',
      module: 'Deliveries',
      targetType: 'IncidentReport',
      targetId: incident.id,
      details: type.name,
    });
    return incident;
  }

  async findAll(actor: AuthUser, q: IncidentQueryDto, mine = false) {
    const { skip, take, page, limit } = paginate(q);
    const where: Prisma.IncidentReportWhereInput = {
      ...(await this.where(actor, q.businessId)),
      ...(mine && { reportedById: actor.id }),
      status: q.status,
      incidentTypeId: q.incidentTypeId,
      ...(q.search && {
        description: { contains: q.search, mode: 'insensitive' },
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.incidentReport.findMany({
        where,
        skip,
        take,
        include,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.incidentReport.count({ where }),
    ]);
    return pageResult(items, total, page, limit);
  }

  async findOne(actor: AuthUser, id: string) {
    const i = await this.prisma.incidentReport.findFirst({
      where: { id, ...(await this.where(actor)) },
      include,
    });
    if (!i) throw new NotFoundException('Incident not found');
    return i;
  }

  async setStatus(actor: AuthUser, id: string, status: IncidentStatus) {
    const current = await this.findOne(actor, id);
    if (current.status === status) return current;
    if (!INCIDENT_TRANSITIONS[current.status].includes(status))
      throw new BadRequestException(
        `Cannot change incident status from ${current.status} to ${status}`,
      );
    const changed = await this.prisma.incidentReport.updateMany({
      where: { id, status: current.status },
      data: { status },
    });
    if (!changed.count)
      throw new BadRequestException('Incident was changed concurrently');
    await this.notify.toUser(
      current.reportedById,
      NotificationType.DELIVERY,
      'Incident Updated',
      `Your incident report is now ${status.replace('_', ' ').toLowerCase()}.`,
      { incidentId: id },
    );
    const reporter = await this.prisma.user.findUniqueOrThrow({
      where: { id: current.reportedById },
      select: { businessId: true },
    });
    await this.audit.log(actor, {
      businessId: reporter.businessId,
      action: 'Incident Status Changed',
      module: 'Deliveries',
      targetType: 'IncidentReport',
      targetId: id,
      details: `${current.status} → ${status}`,
    });
    return this.findOne(actor, id);
  }
}

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AlertsModule } from './alerts/alerts.module.js';
import { AdministratorsModule } from './administrators/administrators.module.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { AuditLogsModule } from './audit-logs/audit-logs.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { BusinessesModule } from './businesses/businesses.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { CommonModule } from './common/common.module.js';
import {
  DEFAULT_TIME_ZONE,
  requestContext,
} from './common/utils/request-context.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { PermissionGuard } from './common/access/permission.guard.js';
import { ComplianceModule } from './compliance/compliance.module.js';
import { validateEnv } from './config/env.validation.js';
import { DamageReportsModule } from './damage-reports/damage-reports.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DeliveriesModule } from './deliveries/deliveries.module.js';
import { DepotsModule } from './depots/depots.module.js';
import { HealthModule } from './health/health.module.js';
import { IncidentsModule } from './incidents/incidents.module.js';
import { InspectionsModule } from './inspections/inspections.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { NotificationsModule } from './notifications/notifications.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RegionsModule } from './regions/regions.module.js';
import { RepairRequestsModule } from './repair-requests/repair-requests.module.js';
import { RolesModule } from './roles/roles.module.js';
import { RosterModule } from './roster/roster.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { UploadsModule } from './uploads/uploads.controller.js';
import { UsersModule } from './users/users.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuthModule,
    HealthModule,
    UploadsModule,
    // Platform admin
    BusinessesModule,
    AdministratorsModule,
    RegionsModule,
    RolesModule,
    // Business admin / setup
    UsersModule,
    DepotsModule,
    SettingsModule,
    CatalogModule,
    AuditLogsModule,
    // Fleet
    VehiclesModule,
    InspectionsModule,
    DamageReportsModule,
    RepairRequestsModule,
    MaintenanceModule,
    LocationsModule,
    // Roster
    ComplianceModule,
    RosterModule,
    AttendanceModule,
    // Deliveries & communication
    DeliveriesModule,
    IncidentsModule,
    MessagesModule,
    NotificationsModule,
    DashboardModule,
    AlertsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Per-request context; the JWT guard fills in the business time zone.
    consumer
      .apply((_req: Request, _res: Response, next: NextFunction) =>
        requestContext.run({ timeZone: DEFAULT_TIME_ZONE }, next),
      )
      .forRoutes('*');
  }
}

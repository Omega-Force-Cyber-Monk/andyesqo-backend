import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiQuery,
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  FLEET_ROLES,
  MANAGERS,
  Roles,
  ROSTER_ROLES,
} from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PermissionModule, UserRole } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import { DashboardService } from './dashboard.service.js';
import { ApiData } from '../common/swagger/swagger.js';
import {
  BusinessAdminDashboard,
  DriverOverview,
  FleetDashboard,
  LiveDrivers,
  OperationsReport,
  PlatformDashboard,
  RosterDashboard,
  SupervisorDashboard,
} from '../common/swagger/responses.dto.js';

@ApiTags('Dashboards & Reports')
@ApiBearerAuth()
@ApiQuery({
  name: 'businessId',
  required: false,
  description: 'Super admin only',
})
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard/roster')
  @RequirePermission(PermissionModule.DASHBOARD, 'view')
  @Roles(...ROSTER_ROLES)
  @ApiOperation({ summary: 'Roster Dashboard home' })
  @ApiData(RosterDashboard)
  roster(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.dashboard.roster(user, businessId);
  }

  @Get('dashboard/fleet')
  @RequirePermission(PermissionModule.DASHBOARD, 'view')
  @Roles(...FLEET_ROLES)
  @ApiOperation({ summary: 'Fleet Dashboard home' })
  @ApiData(FleetDashboard)
  fleet(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.dashboard.fleet(user, businessId);
  }

  @Get('dashboard/supervisor')
  @RequirePermission(PermissionModule.DASHBOARD, 'view')
  @Roles(UserRole.SUPERVISOR, UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Supervisor Overview' })
  @ApiData(SupervisorDashboard)
  supervisor(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.dashboard.supervisor(user, businessId);
  }

  @Get('dashboard/business-admin')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Admin Operations Dashboard' })
  @ApiData(BusinessAdminDashboard)
  businessAdmin(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.dashboard.businessAdmin(user, businessId);
  }

  @Get('dashboard/platform')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin Dashboard' })
  @ApiData(PlatformDashboard)
  platform() {
    return this.dashboard.platform();
  }

  @Get('reports/operations')
  @RequirePermission(PermissionModule.REPORTS, 'view')
  @Roles(UserRole.SUPERVISOR, UserRole.BUSINESS_ADMIN)
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiOperation({
    summary:
      'Supervisor Reports: on-time rate, inspections, groundings, drop time',
  })
  @ApiData(OperationsReport)
  reports(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('businessId') businessId?: string,
  ) {
    return this.dashboard.reports(user, from, to, businessId);
  }

  @Get('drivers/live')
  @RequirePermission(PermissionModule.DRIVERS, 'view')
  @Roles(...MANAGERS)
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({ summary: 'Active Driver Roster: drivers on shift now' })
  @ApiData(LiveDrivers)
  live(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('businessId') businessId?: string,
  ) {
    return this.dashboard.liveDrivers(user, search, businessId);
  }

  @Get('drivers/:id/overview')
  @RequirePermission(PermissionModule.DRIVERS, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({
    summary:
      'Driver Details: profile, check-in, allocation, compliance, performance',
  })
  @ApiData(DriverOverview)
  driver(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dashboard.driverOverview(user, id);
  }
}

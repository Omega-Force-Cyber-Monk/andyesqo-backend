import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PermissionModule, UserRole } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import {
  LatestLocationsQueryDto,
  LocationBatchDto,
  LocationHistoryQueryDto,
  LocationUpdateDto,
} from './locations.dto.js';
import { LocationsService } from './locations.service.js';
import { ApiData } from '../common/swagger/swagger.js';
import { DriverLocationModel } from '../common/swagger/entities.dto.js';
import {
  Accepted,
  DeliveryTrack,
  LiveLocation,
  LocationHistory,
  RouteResult,
} from '../common/swagger/responses.dto.js';

@ApiTags('Driver locations')
@ApiBearerAuth()
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Post('me')
  @Roles(UserRole.DRIVER)
  @ApiOperation({
    summary: 'Driver: record a GPS point (only while clocked in)',
  })
  @ApiData(DriverLocationModel, { status: 201 })
  record(@CurrentUser() user: AuthUser, @Body() dto: LocationUpdateDto) {
    return this.locations.record(user, dto);
  }

  @Post('me/batch')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'Driver: upload up to 100 buffered GPS points' })
  @ApiData(Accepted, { status: 201 })
  recordBatch(@CurrentUser() user: AuthUser, @Body() dto: LocationBatchDto) {
    return this.locations.recordBatch(user, dto.points);
  }

  @Get('latest')
  @RequirePermission(PermissionModule.LIVE_MAP, 'view')
  @Roles(UserRole.BUSINESS_ADMIN, UserRole.SUPERVISOR, UserRole.FLEET_MANAGER)
  @ApiOperation({
    summary:
      'Live GPS Fleet Map: latest point per driver with vehicle and active delivery',
  })
  @ApiData([LiveLocation])
  latest(
    @CurrentUser() user: AuthUser,
    @Query() query: LatestLocationsQueryDto,
  ) {
    return this.locations.latest(user, query);
  }

  @Get('deliveries/:deliveryId/track')
  @RequirePermission(PermissionModule.LIVE_MAP, 'view')
  @Roles(UserRole.BUSINESS_ADMIN, UserRole.SUPERVISOR, UserRole.FLEET_MANAGER)
  @ApiOperation({
    summary: 'Track a delivery: driver position, speed and path since start',
  })
  @ApiData(DeliveryTrack)
  track(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Query('businessId') businessId?: string,
  ) {
    return this.locations.trackDelivery(user, deliveryId, businessId);
  }

  @Get('deliveries/:deliveryId/route')
  @RequirePermission(PermissionModule.DELIVERIES, 'view')
  @Roles(UserRole.DRIVER)
  @ApiOperation({
    summary:
      'Driver: route to a delivery from the latest location (routing provider)',
  })
  @ApiData(RouteResult)
  route(
    @CurrentUser() user: AuthUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.locations.deliveryRoute(user, deliveryId);
  }

  @Get('drivers/:driverId/history')
  @RequirePermission(PermissionModule.LIVE_MAP, 'view')
  @Roles(UserRole.BUSINESS_ADMIN, UserRole.SUPERVISOR, UserRole.FLEET_MANAGER)
  @ApiOperation({
    summary: 'Driver route history (up to 24 hours, paginated by cursor)',
  })
  @ApiData(LocationHistory)
  history(
    @CurrentUser() user: AuthUser,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query() query: LocationHistoryQueryDto,
  ) {
    return this.locations.history(user, driverId, query);
  }
}

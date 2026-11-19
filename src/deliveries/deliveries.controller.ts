import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  FIELD_ROLES,
  MANAGERS,
  Roles,
} from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import {
  DeliveryStatus,
  PermissionModule,
  UserRole,
} from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import { DeliveriesService } from './deliveries.service.js';
import {
  CompleteDeliveryDto,
  CreateDeliveryDto,
  DelayDto,
  DeliveryQueryDto,
  EtaDto,
  PickupDto,
  UpdateDeliveryDto,
} from './dto/delivery.dto.js';
import { ApiData, ApiPage } from '../common/swagger/swagger.js';
import { DeliveryModel } from '../common/swagger/entities.dto.js';
import {
  DeliveryStats,
  MyDeliveries,
} from '../common/swagger/responses.dto.js';

const DISPATCH = [UserRole.BUSINESS_ADMIN, UserRole.SUPERVISOR];

@ApiTags('Deliveries')
@ApiBearerAuth()
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Post()
  @RequirePermission(PermissionModule.DELIVERIES, 'edit')
  @Roles(...DISPATCH)
  @ApiOperation({ summary: 'Create & Dispatch delivery' })
  @ApiData(DeliveryModel, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDeliveryDto) {
    return this.deliveries.create(user, dto);
  }

  @Get()
  @RequirePermission(PermissionModule.DELIVERIES, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Deliveries list' })
  @ApiPage(DeliveryModel)
  findAll(@CurrentUser() user: AuthUser, @Query() q: DeliveryQueryDto) {
    return this.deliveries.findAll(user, q);
  }

  @Get('stats')
  @RequirePermission(PermissionModule.DELIVERIES, 'view')
  @Roles(...MANAGERS)
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'businessId', required: false })
  @ApiOperation({ summary: "Today's delivery counts and on-time rate" })
  @ApiData(DeliveryStats)
  stats(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
    @Query('businessId') businessId?: string,
  ) {
    return this.deliveries.stats(user, date, businessId);
  }

  @Get('me/today')
  @RequirePermission(PermissionModule.DELIVERIES, 'view')
  @Roles(...FIELD_ROLES)
  @ApiQuery({ name: 'status', required: false, enum: DeliveryStatus })
  @ApiOperation({ summary: "Driver: today's deliveries" })
  @ApiData(MyDeliveries)
  myToday(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: DeliveryStatus,
  ) {
    return this.deliveries.myToday(user, status);
  }

  @Get('me')
  @RequirePermission(PermissionModule.DELIVERIES, 'view')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'Driver: my deliveries' })
  @ApiPage(DeliveryModel)
  mine(@CurrentUser() user: AuthUser, @Query() q: DeliveryQueryDto) {
    return this.deliveries.findAll(user, q, true);
  }

  @Get('driver/:driverId/history')
  @RequirePermission(PermissionModule.DELIVERIES, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Driver delivery history' })
  @ApiData([DeliveryModel])
  history(
    @CurrentUser() user: AuthUser,
    @Param('driverId', ParseUUIDPipe) driverId: string,
  ) {
    return this.deliveries.historyFor(user, driverId);
  }

  @Get(':id')
  @RequirePermission(PermissionModule.DELIVERIES, 'view')
  @ApiOperation({ summary: 'Delivery Details' })
  @ApiData(DeliveryModel)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveries.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.DELIVERIES, 'edit')
  @Roles(...DISPATCH)
  @ApiOperation({ summary: 'Edit delivery details or assignment' })
  @ApiData(DeliveryModel)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryDto,
  ) {
    return this.deliveries.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.DELIVERIES, 'edit')
  @Roles(...DISPATCH)
  @ApiOperation({ summary: 'Cancel a delivery' })
  @ApiData(DeliveryModel)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveries.cancel(user, id);
  }

  @Post(':id/start')
  @RequirePermission(PermissionModule.DELIVERIES, 'edit')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'Start Delivery (navigation)' })
  @ApiData(DeliveryModel, { status: 201 })
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deliveries.start(user, id);
  }

  @Post(':id/pickup')
  @RequirePermission(PermissionModule.DELIVERIES, 'edit')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'Pickup Confirmation (photos, barcode)' })
  @ApiData(DeliveryModel, { status: 201 })
  pickup(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PickupDto,
  ) {
    return this.deliveries.pickup(user, id, dto);
  }

  @Post(':id/complete')
  @RequirePermission(PermissionModule.DELIVERIES, 'edit')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'Delivery Confirmation (photos, notes)' })
  @ApiData(DeliveryModel, { status: 201 })
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteDeliveryDto,
  ) {
    return this.deliveries.complete(user, id, dto);
  }

  @Post(':id/delay')
  @RequirePermission(PermissionModule.DELIVERIES, 'edit')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'Report Delay' })
  @ApiData(DeliveryModel, { status: 201 })
  delay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DelayDto,
  ) {
    return this.deliveries.delay(user, id, dto);
  }

  @Patch(':id/eta')
  @RequirePermission(PermissionModule.DELIVERIES, 'edit')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'Update the ETA' })
  @ApiData(DeliveryModel)
  eta(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EtaDto,
  ) {
    return this.deliveries.updateEta(user, id, dto.eta);
  }
}

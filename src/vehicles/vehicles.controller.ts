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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  FLEET_ROLES,
  MANAGERS,
  Roles,
} from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PermissionModule, UserRole } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import {
  AssignDriverDto,
  CreateVehicleDto,
  UpdateVehicleDto,
  UpdateVehicleStatusDto,
  VehicleQueryDto,
} from './dto/vehicle.dto.js';
import { VehiclesService } from './vehicles.service.js';
import { ApiData, ApiPage } from '../common/swagger/swagger.js';
import {
  VehicleModel,
  VehicleStatusLogModel,
} from '../common/swagger/entities.dto.js';
import {
  VehicleAttention,
  VehicleDetail,
  VehicleStats,
} from '../common/swagger/responses.dto.js';

@ApiTags('Fleet - Vehicles')
@ApiBearerAuth()
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @RequirePermission(PermissionModule.VEHICLES, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Vehicles / Vehicles Registry list' })
  @ApiPage(VehicleModel)
  findAll(@CurrentUser() user: AuthUser, @Query() q: VehicleQueryDto) {
    return this.vehicles.findAll(user, q);
  }

  @Get('stats')
  @RequirePermission(PermissionModule.VEHICLES, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Fleet Status counts' })
  @ApiData(VehicleStats)
  stats(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.vehicles.stats(user, businessId);
  }

  @Get('attention')
  @RequirePermission(PermissionModule.VEHICLES, 'view')
  @Roles(...FLEET_ROLES)
  @ApiOperation({
    summary: 'Requires Attention: overdue maintenance, inspection due',
  })
  @ApiData(VehicleAttention)
  attention(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.vehicles.attention(user, businessId);
  }

  @Post()
  @RequirePermission(PermissionModule.VEHICLES, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN, UserRole.FLEET_MANAGER)
  @ApiOperation({ summary: 'Add New Vehicle' })
  @ApiData(VehicleModel, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) {
    return this.vehicles.create(user, dto);
  }

  @Get(':id')
  @RequirePermission(PermissionModule.VEHICLES, 'view')
  @ApiOperation({ summary: 'Vehicle details with readiness check' })
  @ApiData(VehicleDetail)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vehicles.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.VEHICLES, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN, UserRole.FLEET_MANAGER)
  @ApiOperation({ summary: 'Edit vehicle' })
  @ApiData(VehicleModel)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehicles.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.VEHICLES, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN, UserRole.FLEET_MANAGER)
  @ApiOperation({ summary: 'Delete vehicle' })
  @ApiData(VehicleModel)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vehicles.remove(user, id);
  }

  @Patch(':id/status')
  @RequirePermission(PermissionModule.VEHICLES, 'edit')
  @Roles(...FLEET_ROLES)
  @ApiOperation({ summary: 'Update Vehicle Status (also "Ground Vehicle")' })
  @ApiData(VehicleModel)
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleStatusDto,
  ) {
    return this.vehicles.setStatus(user, id, dto.status, dto.reason);
  }

  @Get(':id/status-history')
  @RequirePermission(PermissionModule.VEHICLES, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Vehicle status history' })
  @ApiData([VehicleStatusLogModel])
  history(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vehicles.statusHistory(user, id);
  }

  @Patch(':id/assign-driver')
  @RequirePermission(PermissionModule.VEHICLES, 'edit')
  @Roles(
    UserRole.BUSINESS_ADMIN,
    UserRole.FLEET_MANAGER,
    UserRole.ROSTER_MANAGER,
  )
  @ApiOperation({ summary: 'Assign Driver to a vehicle' })
  @ApiData(VehicleModel)
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDriverDto,
  ) {
    return this.vehicles.assignDriver(user, id, dto.driverId);
  }
}

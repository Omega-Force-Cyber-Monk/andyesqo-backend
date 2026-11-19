import {
  Body,
  Controller,
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
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  FIELD_ROLES,
  FLEET_ROLES,
  MANAGERS,
  Roles,
} from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import { PermissionModule } from '../generated/prisma/enums.js';
import { GroundDto } from '../inspections/dto/inspection.dto.js';
import { RepairFieldsDto } from '../repair-requests/dto/repair.dto.js';
import { DamageReportsService } from './damage-reports.service.js';
import {
  AssessDamageDto,
  CreateDamageReportDto,
  DamageQueryDto,
} from './dto/damage-report.dto.js';
import { ApiData, ApiPage } from '../common/swagger/swagger.js';
import {
  DamageReportModel,
  RepairRequestModel,
} from '../common/swagger/entities.dto.js';
import { DamageStats } from '../common/swagger/responses.dto.js';

class CreateRepairFromDamageDto extends PartialType(RepairFieldsDto) {}

@ApiTags('Fleet - Damage Reports')
@ApiBearerAuth()
@Controller('damage-reports')
export class DamageReportsController {
  constructor(private readonly reports: DamageReportsService) {}

  @Post()
  @RequirePermission(PermissionModule.INSPECTIONS, 'edit')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'Report Vehicle Damage (driver app)' })
  @ApiData(DamageReportModel, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDamageReportDto) {
    return this.reports.create(user, dto);
  }

  @Get('mine')
  @RequirePermission(PermissionModule.INSPECTIONS, 'view')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'My damage reports' })
  @ApiPage(DamageReportModel)
  mine(@CurrentUser() user: AuthUser, @Query() q: DamageQueryDto) {
    return this.reports.findAll(user, q, true);
  }

  @Get()
  @RequirePermission(PermissionModule.INSPECTIONS, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Damage Reports list' })
  @ApiPage(DamageReportModel)
  findAll(@CurrentUser() user: AuthUser, @Query() q: DamageQueryDto) {
    return this.reports.findAll(user, q);
  }

  @Get('stats')
  @RequirePermission(PermissionModule.INSPECTIONS, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Damage report counts' })
  @ApiData(DamageStats)
  stats(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.reports.stats(user, businessId);
  }

  @Get(':id')
  @RequirePermission(PermissionModule.INSPECTIONS, 'view')
  @ApiOperation({ summary: 'Damage Report Details' })
  @ApiData(DamageReportModel)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reports.findOne(user, id);
  }

  @Patch(':id/assessment')
  @RequirePermission(PermissionModule.INSPECTIONS, 'edit')
  @Roles(...FLEET_ROLES)
  @ApiOperation({ summary: 'Fleet Manager Assessment and repair estimates' })
  @ApiData(DamageReportModel)
  assess(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssessDamageDto,
  ) {
    return this.reports.assess(user, id, dto);
  }

  @Post(':id/approve')
  @RequirePermission(PermissionModule.INSPECTIONS, 'edit')
  @Roles(...FLEET_ROLES)
  @ApiOperation({ summary: 'Approve Report' })
  @ApiData(DamageReportModel, { status: 201 })
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reports.approve(user, id);
  }

  @Post(':id/ground-vehicle')
  @RequirePermission(PermissionModule.INSPECTIONS, 'edit')
  @Roles(...FLEET_ROLES)
  @ApiOperation({ summary: 'Ground Vehicle from a damage report' })
  @ApiData(DamageReportModel, { status: 201 })
  ground(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GroundDto,
  ) {
    return this.reports.ground(user, id, dto.reason);
  }

  @Post(':id/repair-request')
  @RequirePermission(PermissionModule.INSPECTIONS, 'edit')
  @Roles(...FLEET_ROLES)
  @ApiOperation({ summary: 'Create Repair Request from a damage report' })
  @ApiData(RepairRequestModel, { status: 201 })
  createRepair(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRepairFromDamageDto,
  ) {
    return this.reports.createRepair(user, id, dto);
  }
}

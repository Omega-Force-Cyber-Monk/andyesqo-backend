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
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { FLEET_ROLES, Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import { PermissionModule } from '../generated/prisma/enums.js';
import {
  CreateRepairDto,
  RepairQueryDto,
  RepairStatusDto,
  UpdateRepairDto,
} from './dto/repair.dto.js';
import { RepairRequestsService } from './repair-requests.service.js';
import { ApiData, ApiPage } from '../common/swagger/swagger.js';
import { RepairRequestModel } from '../common/swagger/entities.dto.js';
import { RepairStats } from '../common/swagger/responses.dto.js';

@ApiTags('Fleet - Repair Requests')
@ApiBearerAuth()
@Roles(...FLEET_ROLES)
@Controller('repair-requests')
export class RepairRequestsController {
  constructor(private readonly repairs: RepairRequestsService) {}

  @Post()
  @RequirePermission(PermissionModule.REPAIRS, 'edit')
  @ApiOperation({ summary: 'Create Repair Request' })
  @ApiData(RepairRequestModel, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRepairDto) {
    return this.repairs.create(user, dto);
  }

  @Get()
  @RequirePermission(PermissionModule.REPAIRS, 'view')
  @ApiOperation({ summary: 'Repair Requests list' })
  @ApiPage(RepairRequestModel)
  findAll(@CurrentUser() user: AuthUser, @Query() q: RepairQueryDto) {
    return this.repairs.findAll(user, q);
  }

  @Get('stats')
  @RequirePermission(PermissionModule.REPAIRS, 'view')
  @ApiOperation({ summary: 'Repair request counts' })
  @ApiData(RepairStats)
  stats(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.repairs.stats(user, businessId);
  }

  @Get(':id')
  @RequirePermission(PermissionModule.REPAIRS, 'view')
  @ApiOperation({ summary: 'Repair request details' })
  @ApiData(RepairRequestModel)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.repairs.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.REPAIRS, 'edit')
  @ApiOperation({ summary: 'Edit an open repair request' })
  @ApiData(RepairRequestModel)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRepairDto,
  ) {
    return this.repairs.update(user, id, dto);
  }

  @Patch(':id/status')
  @RequirePermission(PermissionModule.REPAIRS, 'edit')
  @ApiOperation({ summary: 'Approve, start, complete or reject a repair' })
  @ApiData(RepairRequestModel)
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RepairStatusDto,
  ) {
    return this.repairs.setStatus(user, id, dto);
  }
}

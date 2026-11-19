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
import { IsNotEmpty, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { FLEET_ROLES, Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import { PermissionModule } from '../generated/prisma/enums.js';
import {
  AvailabilityCheckDto,
  CreateMaintenanceDto,
  MaintenanceQueryDto,
  MaintenanceStatusDto,
  TaskToggleDto,
  UpdateMaintenanceDto,
} from './dto/maintenance.dto.js';
import { MaintenanceService } from './maintenance.service.js';
import { ApiData, ApiPage } from '../common/swagger/swagger.js';
import {
  MaintenanceModel,
  MaintenanceTaskModel,
} from '../common/swagger/entities.dto.js';
import {
  AvailabilityCheck,
  MaintenanceDetail,
  MaintenanceStats,
} from '../common/swagger/responses.dto.js';
import { DeletedResult } from '../common/swagger/common.dto.js';

class AddTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;
}

@ApiTags('Fleet - Scheduled Maintenance')
@ApiBearerAuth()
@Roles(...FLEET_ROLES)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get('availability-check')
  @RequirePermission(PermissionModule.MAINTENANCE, 'view')
  @ApiOperation({ summary: 'Vehicle Availability Check step of the wizard' })
  @ApiData(AvailabilityCheck)
  check(@CurrentUser() user: AuthUser, @Query() q: AvailabilityCheckDto) {
    return this.maintenance.availabilityCheck(user, q.vehicleId, q.date);
  }

  @Post()
  @RequirePermission(PermissionModule.MAINTENANCE, 'edit')
  @ApiOperation({ summary: 'Confirm & Schedule Maintenance' })
  @ApiData(MaintenanceDetail, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMaintenanceDto) {
    return this.maintenance.create(user, dto);
  }

  @Get()
  @RequirePermission(PermissionModule.MAINTENANCE, 'view')
  @ApiOperation({ summary: 'Scheduled maintenance list' })
  @ApiPage(MaintenanceDetail)
  findAll(@CurrentUser() user: AuthUser, @Query() q: MaintenanceQueryDto) {
    return this.maintenance.findAll(user, q);
  }

  @Get('stats')
  @RequirePermission(PermissionModule.MAINTENANCE, 'view')
  @ApiOperation({ summary: 'Maintenance counts' })
  @ApiData(MaintenanceStats)
  stats(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.maintenance.stats(user, businessId);
  }

  @Get('upcoming')
  @RequirePermission(PermissionModule.MAINTENANCE, 'view')
  @ApiOperation({ summary: 'Upcoming maintenance (next 14 days)' })
  @ApiData([MaintenanceDetail])
  upcoming(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.maintenance.upcoming(user, businessId);
  }

  @Get(':id')
  @RequirePermission(PermissionModule.MAINTENANCE, 'view')
  @ApiOperation({ summary: 'Maintenance details' })
  @ApiData(MaintenanceDetail)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.maintenance.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.MAINTENANCE, 'edit')
  @ApiOperation({ summary: 'Edit scheduled maintenance' })
  @ApiData(MaintenanceDetail)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceDto,
  ) {
    return this.maintenance.update(user, id, dto);
  }

  @Patch(':id/status')
  @RequirePermission(PermissionModule.MAINTENANCE, 'edit')
  @ApiOperation({ summary: 'Start, complete or cancel maintenance' })
  @ApiData(MaintenanceDetail)
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MaintenanceStatusDto,
  ) {
    return this.maintenance.setStatus(user, id, dto);
  }

  @Post(':id/tasks')
  @RequirePermission(PermissionModule.MAINTENANCE, 'edit')
  @ApiOperation({ summary: 'Add Task to the work checklist' })
  @ApiData(MaintenanceTaskModel, { status: 201 })
  addTask(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTaskDto,
  ) {
    return this.maintenance.addTask(user, id, dto.title);
  }

  @Patch(':id/tasks/:taskId')
  @RequirePermission(PermissionModule.MAINTENANCE, 'edit')
  @ApiOperation({ summary: 'Tick or untick a task' })
  @ApiData(MaintenanceTaskModel)
  toggleTask(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: TaskToggleDto,
  ) {
    return this.maintenance.toggleTask(user, id, taskId, dto.done);
  }

  @Delete(':id/tasks/:taskId')
  @RequirePermission(PermissionModule.MAINTENANCE, 'edit')
  @ApiOperation({ summary: 'Remove a task' })
  @ApiData(DeletedResult)
  removeTask(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.maintenance.removeTask(user, id, taskId);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.MAINTENANCE, 'edit')
  @ApiOperation({ summary: 'Delete maintenance' })
  @ApiData(MaintenanceModel)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.maintenance.remove(user, id);
  }
}

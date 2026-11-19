import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  FIELD_ROLES,
  FLEET_ROLES,
  MANAGERS,
  Roles,
} from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { InspectionType, PermissionModule } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import {
  CreateInspectionDto,
  GroundDto,
  InspectionQueryDto,
} from './dto/inspection.dto.js';
import { InspectionsService } from './inspections.service.js';
import { ApiData } from '../common/swagger/swagger.js';
import {
  InspectionModel,
  VehicleModel,
} from '../common/swagger/entities.dto.js';
import {
  Checklist,
  InspectionOverview,
  Notified,
  ReminderResult,
} from '../common/swagger/responses.dto.js';

@ApiTags('Fleet - Inspections')
@ApiBearerAuth()
@Controller('inspections')
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get('checklist/:type')
  @RequirePermission(PermissionModule.INSPECTIONS, 'view')
  @ApiOperation({ summary: 'Checklist items for PRE_SHIFT or POST_SHIFT' })
  @ApiData(Checklist)
  checklist(
    @Param('type', new ParseEnumPipe(InspectionType)) type: InspectionType,
  ) {
    return this.inspections.checklist(type);
  }

  @Post()
  @RequirePermission(PermissionModule.INSPECTIONS, 'edit')
  @Roles(...FIELD_ROLES)
  @ApiOperation({
    summary: 'Submit pre-shift / post-shift inspection (driver app)',
  })
  @ApiData(InspectionModel, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInspectionDto) {
    return this.inspections.create(user, dto);
  }

  @Get('mine')
  @RequirePermission(PermissionModule.INSPECTIONS, 'view')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'My inspections' })
  @ApiData([InspectionModel])
  mine(@CurrentUser() user: AuthUser, @Query() q: InspectionQueryDto) {
    return this.inspections.findAll(user, q, true);
  }

  @Get('overview/today')
  @RequirePermission(PermissionModule.INSPECTIONS, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Inspection Overview for today' })
  @ApiData(InspectionOverview)
  overview(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.inspections.todayOverview(user, businessId);
  }

  @Get()
  @RequirePermission(PermissionModule.INSPECTIONS, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({
    summary: 'Vehicle Inspections list (fleet / supervisor / admin)',
  })
  @ApiData([InspectionModel])
  findAll(@CurrentUser() user: AuthUser, @Query() q: InspectionQueryDto) {
    return this.inspections.findAll(user, q);
  }

  @Get(':id')
  @RequirePermission(PermissionModule.INSPECTIONS, 'view')
  @ApiOperation({ summary: 'Inspection Details' })
  @ApiData(InspectionModel)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inspections.findOne(user, id);
  }

  @Patch(':id/review')
  @RequirePermission(PermissionModule.INSPECTIONS, 'edit')
  @Roles(...FLEET_ROLES)
  @ApiOperation({ summary: 'Mark as reviewed' })
  @ApiData(InspectionModel)
  review(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inspections.review(user, id);
  }

  @Post(':id/ground-vehicle')
  @RequirePermission(PermissionModule.INSPECTIONS, 'edit')
  @Roles(...FLEET_ROLES)
  @ApiOperation({ summary: 'Ground Vehicle from an inspection' })
  @ApiData(VehicleModel, { status: 201 })
  ground(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GroundDto,
  ) {
    return this.inspections.ground(user, id, dto.reason);
  }

  @Post('reminders')
  @HttpCode(200)
  @RequirePermission(PermissionModule.INSPECTIONS, 'edit')
  @Roles(...FLEET_ROLES)
  @ApiOperation({
    summary:
      "Send driver reminders: notify today's drivers who have not submitted the pre-shift inspection",
  })
  @ApiData(ReminderResult)
  remind(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.inspections.remindPending(user, businessId);
  }

  @Post(':id/contact-fleet-manager')
  @RequirePermission(PermissionModule.INSPECTIONS, 'edit')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'Contact Fleet Manager about a failed inspection' })
  @ApiData(Notified, { status: 201 })
  contact(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inspections.contactFleet(user, id);
  }
}

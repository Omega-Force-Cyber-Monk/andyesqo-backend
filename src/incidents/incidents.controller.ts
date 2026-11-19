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
import {
  FIELD_ROLES,
  MANAGERS,
  Roles,
} from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PermissionModule } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import {
  CreateIncidentDto,
  IncidentQueryDto,
  IncidentStatusDto,
} from './dto/incident.dto.js';
import { IncidentsService } from './incidents.service.js';
import { ApiData, ApiPage } from '../common/swagger/swagger.js';
import { IncidentReportModel } from '../common/swagger/entities.dto.js';

@ApiTags('Incidents')
@ApiBearerAuth()
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post()
  @RequirePermission(PermissionModule.DELIVERIES, 'edit', { selfService: true })
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'Incident Report for a delivery' })
  @ApiData(IncidentReportModel, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIncidentDto) {
    return this.incidents.create(user, dto);
  }

  @Get('mine')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'My incident reports' })
  @ApiPage(IncidentReportModel)
  mine(@CurrentUser() user: AuthUser, @Query() q: IncidentQueryDto) {
    return this.incidents.findAll(user, q, true);
  }

  @Get()
  @RequirePermission(PermissionModule.DELIVERIES, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Incidents list' })
  @ApiPage(IncidentReportModel)
  findAll(@CurrentUser() user: AuthUser, @Query() q: IncidentQueryDto) {
    return this.incidents.findAll(user, q);
  }

  @Get(':id')
  @RequirePermission(PermissionModule.DELIVERIES, 'view', { selfService: true })
  @Roles(...MANAGERS, ...FIELD_ROLES)
  @ApiOperation({ summary: 'Incident details' })
  @ApiData(IncidentReportModel)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.incidents.findOne(user, id);
  }

  @Patch(':id/status')
  @RequirePermission(PermissionModule.DELIVERIES, 'edit')
  @Roles(...MANAGERS)
  @ApiOperation({
    summary: 'Review an incident (submitted, under review, resolved)',
  })
  @ApiData(IncidentReportModel)
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IncidentStatusDto,
  ) {
    return this.incidents.setStatus(user, id, dto.status);
  }
}

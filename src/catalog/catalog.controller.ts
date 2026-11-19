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
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import { PermissionModule, UserRole } from '../generated/prisma/enums.js';
import { CatalogService } from './catalog.service.js';
import {
  CreateDamageTypeDto,
  CreateIncidentTypeDto,
  UpdateDamageTypeDto,
  UpdateIncidentTypeDto,
} from './dto/catalog.dto.js';
import { ApiData } from '../common/swagger/swagger.js';
import {
  DamageTypeModel,
  IncidentTypeModel,
} from '../common/swagger/entities.dto.js';

@ApiTags('Config - Damage Types')
@ApiBearerAuth()
@Controller('damage-types')
export class DamageTypesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Damage types (drivers see active types only)' })
  @ApiData([DamageTypeModel])
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('businessId') businessId?: string,
  ) {
    return this.catalog.damageTypes(user, search, businessId);
  }

  @Post()
  @RequirePermission(PermissionModule.SETTINGS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Create Damage Category' })
  @ApiData(DamageTypeModel, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDamageTypeDto) {
    return this.catalog.createDamageType(user, dto);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.SETTINGS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Edit Damage Category' })
  @ApiData(DamageTypeModel)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDamageTypeDto,
  ) {
    return this.catalog.updateDamageType(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.SETTINGS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Delete Damage Category' })
  @ApiData(DamageTypeModel)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.catalog.removeDamageType(user, id);
  }
}

@ApiTags('Config - Incident Types')
@ApiBearerAuth()
@Controller('incident-types')
export class IncidentTypesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Incident types (drivers see active types only)' })
  @ApiData([IncidentTypeModel])
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('businessId') businessId?: string,
  ) {
    return this.catalog.incidentTypes(user, search, businessId);
  }

  @Post()
  @RequirePermission(PermissionModule.SETTINGS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Create Incident Category' })
  @ApiData(IncidentTypeModel, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIncidentTypeDto) {
    return this.catalog.createIncidentType(user, dto);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.SETTINGS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Edit Incident Category' })
  @ApiData(IncidentTypeModel)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentTypeDto,
  ) {
    return this.catalog.updateIncidentType(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.SETTINGS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Delete Incident Category' })
  @ApiData(IncidentTypeModel)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.catalog.removeIncidentType(user, id);
  }
}

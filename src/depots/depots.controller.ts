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
import { PermissionModule, UserRole } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import { DepotsService } from './depots.service.js';
import { CreateDepotDto, UpdateDepotDto } from './dto/depot.dto.js';
import { ApiData } from '../common/swagger/swagger.js';
import { DepotModel } from '../common/swagger/entities.dto.js';
import { DeletedResult } from '../common/swagger/common.dto.js';

@ApiTags('Depots')
@ApiBearerAuth()
@Controller('depots')
export class DepotsController {
  constructor(private readonly depots: DepotsService) {}

  @Get()
  @ApiOperation({ summary: 'Depots in your scope (reference list)' })
  @ApiData([DepotModel])
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.depots.findAll(user, businessId);
  }

  @Post()
  @RequirePermission(PermissionModule.DEPOTS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Create a depot' })
  @ApiData(DepotModel, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDepotDto) {
    return this.depots.create(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Depot details' })
  @ApiData(DepotModel)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.depots.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.DEPOTS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Edit a depot' })
  @ApiData(DepotModel)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepotDto,
  ) {
    return this.depots.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.DEPOTS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Delete a depot' })
  @ApiData(DeletedResult)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.depots.remove(user, id);
  }
}

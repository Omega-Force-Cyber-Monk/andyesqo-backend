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
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { AdministratorsService } from './administrators.service.js';
import {
  AdministratorQueryDto,
  CreateAdministratorDto,
  UpdateAdministratorDto,
} from './dto/administrator.dto.js';
import { ApiData, ApiPage } from '../common/swagger/swagger.js';
import { UserModel } from '../common/swagger/entities.dto.js';
import {
  AdministratorProfile,
  AdministratorStats,
  InvitationResult,
  UserCreated,
} from '../common/swagger/responses.dto.js';

@ApiTags('Platform - Business Administrators')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
@Controller('administrators')
export class AdministratorsController {
  constructor(private readonly admins: AdministratorsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create Business Administrator (sends a 7-day invitation)',
  })
  @ApiData(UserCreated, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAdministratorDto) {
    return this.admins.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Business Administrators list' })
  @ApiPage(AdministratorProfile)
  findAll(@Query() q: AdministratorQueryDto) {
    return this.admins.findAll(q);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Administrator counts: total, active, pending invitation',
  })
  @ApiData(AdministratorStats)
  stats() {
    return this.admins.stats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'View Administrator Profile' })
  @ApiData(AdministratorProfile)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.admins.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Manage Business Administrator (details, status or business)',
  })
  @ApiData(UserModel)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdministratorDto,
  ) {
    return this.admins.update(user, id, dto);
  }

  @Post(':id/resend-invitation')
  @ApiOperation({ summary: 'Resend the administrator invitation' })
  @ApiData(InvitationResult, { status: 201 })
  resend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admins.resend(user, id);
  }
}

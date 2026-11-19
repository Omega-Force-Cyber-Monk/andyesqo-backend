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
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { BusinessesService } from './businesses.service.js';
import {
  BusinessQueryParams,
  CreateBusinessDto,
  UpdateBusinessDto,
} from './dto/business.dto.js';
import { ApiData, ApiPage } from '../common/swagger/swagger.js';
import {
  BusinessCreated,
  BusinessProfile,
  BusinessStats,
} from '../common/swagger/responses.dto.js';

@ApiTags('Platform - Businesses')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Post()
  @ApiOperation({
    summary: 'Create Business (3-step modal: info, administrator, regions)',
  })
  @ApiData(BusinessCreated, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBusinessDto) {
    return this.businesses.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Businesses directory' })
  @ApiPage(BusinessProfile)
  findAll(@Query() q: BusinessQueryParams) {
    return this.businesses.findAll(q);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Business counts: total, active, pending setup, inactive',
  })
  @ApiData(BusinessStats)
  stats() {
    return this.businesses.stats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Business profile with setup checklist' })
  @ApiData(BusinessProfile)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.businesses.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit business info, regions or status (ACTIVE requires the checklist)',
  })
  @ApiData(BusinessProfile)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.businesses.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Archive a business (INACTIVE; tenant users are signed out)',
  })
  @ApiData(BusinessProfile)
  archive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.businesses.archive(user, id);
  }
}

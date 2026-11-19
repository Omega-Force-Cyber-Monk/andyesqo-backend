import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import {
  AssignRegionsDto,
  CreateRegionDto,
  UpdateAssignmentDto,
  UpdateRegionDto,
} from './dto/region.dto.js';
import { RegionsService } from './regions.service.js';
import { ApiData } from '../common/swagger/swagger.js';
import {
  BusinessRegionModel,
  RegionModel,
} from '../common/swagger/entities.dto.js';

@ApiTags('Platform - Regions')
@ApiBearerAuth()
@Roles(UserRole.SUPER_ADMIN)
@Controller('regions')
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  @ApiOperation({ summary: 'Regions & States with business counts' })
  @ApiData([RegionModel])
  findAll() {
    return this.regions.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a region' })
  @ApiData(RegionModel, { status: 201 })
  create(@Body() dto: CreateRegionDto) {
    return this.regions.create(dto);
  }

  @Get('assignments')
  @ApiOperation({ summary: 'Business region assignments' })
  @ApiData([BusinessRegionModel])
  assignments(@Query('search') search?: string) {
    return this.regions.assignments(search);
  }

  @Put('assignments')
  @ApiOperation({ summary: 'Assign Region / State to a business' })
  @ApiData([BusinessRegionModel])
  assign(@CurrentUser() user: AuthUser, @Body() dto: AssignRegionsDto) {
    return this.regions.assign(user, dto);
  }

  @Patch('assignments/:id')
  @ApiOperation({
    summary: 'Change an assignment status (INACTIVE stops counting for setup)',
  })
  @ApiData(BusinessRegionModel)
  updateAssignment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.regions.updateAssignment(user, id, dto.status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a region' })
  @ApiData(RegionModel)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRegionDto) {
    return this.regions.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a region' })
  @ApiData(RegionModel)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.regions.remove(id);
  }
}

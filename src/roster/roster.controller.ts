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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  FIELD_ROLES,
  MANAGERS,
  Roles,
  ROSTER_ROLES,
} from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PermissionModule } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import {
  AvailabilityQueryDto,
  CreateRosterDto,
  PublishDto,
  RosterQueryDto,
  SetAvailabilityDto,
  UpdateShiftDto,
} from './dto/roster.dto.js';
import { RosterService } from './roster.service.js';
import { ApiData, ApiPage } from '../common/swagger/swagger.js';
import {
  AvailabilityModel,
  ShiftModel,
} from '../common/swagger/entities.dto.js';
import {
  AvailabilityBoard,
  MyToday,
  PublishResult,
  UpcomingShiftGroup,
} from '../common/swagger/responses.dto.js';

@ApiTags('Roster - Shifts & Availability')
@ApiBearerAuth()
@Controller()
export class RosterController {
  constructor(private readonly roster: RosterService) {}

  @Post('roster')
  @RequirePermission(PermissionModule.ROSTER, 'edit')
  @Roles(...ROSTER_ROLES)
  @ApiOperation({
    summary:
      'Create Roster (shift details + crews + vehicles); validates compliance & availability',
  })
  @ApiData([ShiftModel], { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRosterDto) {
    return this.roster.create(user, dto);
  }

  @Get('roster')
  @RequirePermission(PermissionModule.ROSTER, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({
    summary: "Roster table / Today's Roster (date or from/to range)",
  })
  @ApiPage(ShiftModel)
  findAll(@CurrentUser() user: AuthUser, @Query() q: RosterQueryDto) {
    return this.roster.findAll(user, q);
  }

  @Get('roster/upcoming')
  @RequirePermission(PermissionModule.ROSTER, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Upcoming Shifts grouped by date, time and depot' })
  @ApiData([UpcomingShiftGroup])
  upcoming(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.roster.upcoming(user, businessId);
  }

  @Post('roster/publish')
  @RequirePermission(PermissionModule.ROSTER, 'edit')
  @Roles(...ROSTER_ROLES)
  @ApiOperation({
    summary: 'Publish draft shifts (crew and managers are notified)',
  })
  @ApiData(PublishResult, { status: 201 })
  publish(@CurrentUser() user: AuthUser, @Body() dto: PublishDto) {
    return this.roster.publish(user, dto);
  }

  @Get('roster/me/today')
  @Roles(...FIELD_ROLES)
  @ApiOperation({
    summary: "Driver / assistant home: today's shift, vehicle, crew, tasks",
  })
  @ApiData(MyToday)
  myToday(@CurrentUser() user: AuthUser) {
    return this.roster.myToday(user);
  }

  @Get('roster/me')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'My published shifts' })
  @ApiData([ShiftModel])
  myShifts(@CurrentUser() user: AuthUser, @Query() q: RosterQueryDto) {
    return this.roster.myShifts(user, q);
  }

  @Get('roster/:id')
  @RequirePermission(PermissionModule.ROSTER, 'view', { selfService: true })
  @Roles(...MANAGERS, ...FIELD_ROLES)
  @ApiOperation({ summary: 'Shift details' })
  @ApiData(ShiftModel)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roster.findOne(user, id);
  }

  @Patch('roster/:id')
  @RequirePermission(PermissionModule.ROSTER, 'edit')
  @Roles(...ROSTER_ROLES)
  @ApiOperation({ summary: 'Edit shift' })
  @ApiData(ShiftModel)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
  ) {
    return this.roster.update(user, id, dto);
  }

  @Delete('roster/:id')
  @RequirePermission(PermissionModule.ROSTER, 'edit')
  @Roles(...ROSTER_ROLES)
  @ApiOperation({ summary: 'Cancel shift' })
  @ApiData(ShiftModel)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roster.cancel(user, id);
  }

  @Get('availability')
  @RequirePermission(PermissionModule.ROSTER, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({
    summary: 'Driver Availability / Assistant Availability for a date',
  })
  @ApiData(AvailabilityBoard)
  availability(
    @CurrentUser() user: AuthUser,
    @Query() q: AvailabilityQueryDto,
  ) {
    return this.roster.availability(user, q);
  }

  @Put('availability')
  @RequirePermission(PermissionModule.ROSTER, 'edit')
  @Roles(...ROSTER_ROLES)
  @ApiOperation({ summary: 'Set a driver or assistant availability' })
  @ApiData(AvailabilityModel)
  setAvailability(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.roster.setAvailability(user, dto);
  }
}

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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  FIELD_ROLES,
  MANAGERS,
  Roles,
  ROSTER_ROLES,
} from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PermissionModule, UserRole } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import { AttendanceService } from './attendance.service.js';
import {
  ClockInDto,
  ClockOutDto,
  CreateFuelLogDto,
  TimesheetQueryDto,
} from './dto/attendance.dto.js';
import { ApiData, ApiPage } from '../common/swagger/swagger.js';
import {
  AttendanceModel,
  FuelLogModel,
} from '../common/swagger/entities.dto.js';
import {
  ClockInResult,
  ClockOutResult,
  EndShiftSummary,
  Timesheet,
} from '../common/swagger/responses.dto.js';

@ApiTags('Shift - Clock In/Out, End Shift & Fuel')
@ApiBearerAuth()
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('attendance/clock-in')
  @Roles(...FIELD_ROLES)
  @ApiOperation({
    summary:
      "Clock in to today's shift (drivers need a passed pre-shift inspection)",
  })
  @ApiData(ClockInResult, { status: 201 })
  clockIn(@CurrentUser() user: AuthUser, @Body() dto: ClockInDto) {
    return this.attendance.clockIn(user, dto);
  }

  @Get('attendance/end-shift-summary')
  @Roles(...FIELD_ROLES)
  @ApiQuery({ name: 'shiftId', required: false })
  @ApiOperation({ summary: 'End Shift steps + Shift Summary' })
  @ApiData(EndShiftSummary)
  summary(@CurrentUser() user: AuthUser, @Query('shiftId') shiftId?: string) {
    return this.attendance.endShiftSummary(user, shiftId);
  }

  @Post('attendance/clock-out')
  @Roles(...FIELD_ROLES)
  @ApiQuery({ name: 'shiftId', required: false })
  @ApiOperation({
    summary: 'Confirm & End Shift (clock out + submit timesheet)',
  })
  @ApiData(ClockOutResult, { status: 201 })
  clockOut(
    @CurrentUser() user: AuthUser,
    @Body() dto: ClockOutDto,
    @Query('shiftId') shiftId?: string,
  ) {
    return this.attendance.clockOut(user, dto, shiftId);
  }

  @Get('attendance/me')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'My attendance history' })
  @ApiData([AttendanceModel])
  mine(@CurrentUser() user: AuthUser, @Query() q: TimesheetQueryDto) {
    return this.attendance.myHistory(user, q);
  }

  @Get('attendance')
  @RequirePermission(PermissionModule.ROSTER, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Timesheets (check-in / check-out list)' })
  @ApiPage(Timesheet)
  timesheets(@CurrentUser() user: AuthUser, @Query() q: TimesheetQueryDto) {
    return this.attendance.timesheets(user, q);
  }

  @Patch('attendance/:id/approve')
  @RequirePermission(PermissionModule.ROSTER, 'edit')
  @Roles(...ROSTER_ROLES, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Approve a submitted timesheet' })
  @ApiData(AttendanceModel)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attendance.approveTimesheet(user, id);
  }

  @Post('fuel-logs')
  @Roles(UserRole.DRIVER)
  @ApiOperation({ summary: 'Fuel / EV charge receipt (or "No fuel today")' })
  @ApiData(FuelLogModel, { status: 201 })
  addFuel(@CurrentUser() user: AuthUser, @Body() dto: CreateFuelLogDto) {
    return this.attendance.addFuel(user, dto);
  }

  @Get('fuel-logs/me')
  @Roles(...FIELD_ROLES)
  @ApiOperation({ summary: 'My fuel and charging receipts' })
  @ApiPage(FuelLogModel)
  myFuel(@CurrentUser() user: AuthUser, @Query() q: TimesheetQueryDto) {
    return this.attendance.fuelLogs(user, q, true);
  }

  @Get('fuel-logs')
  @RequirePermission(PermissionModule.ROSTER, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Fuel and charging receipts' })
  @ApiPage(FuelLogModel)
  fuel(@CurrentUser() user: AuthUser, @Query() q: TimesheetQueryDto) {
    return this.attendance.fuelLogs(user, q);
  }
}

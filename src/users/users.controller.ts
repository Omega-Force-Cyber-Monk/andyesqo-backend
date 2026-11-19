import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RawResponse } from '../common/decorators/raw-response.decorator.js';
import { MANAGERS, Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PermissionModule, UserRole } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import {
  DepotScopeDto,
  PermissionOverrideDto,
  ResetMfaDto,
} from './dto/access.dto.js';
import {
  CreateUserDto,
  UpdateMeDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto/user.dto.js';
import { UsersService } from './users.service.js';
import { ApiCsv, ApiData, ApiPage } from '../common/swagger/swagger.js';
import { UserModel } from '../common/swagger/entities.dto.js';
import {
  InvitationResult,
  MfaResetResult,
  MyProfile,
  UserAccess,
  UserCreated,
  UserStats,
} from '../common/swagger/responses.dto.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me/profile')
  @ApiOperation({ summary: 'My Profile (driver / assistant app)' })
  @ApiData(MyProfile)
  myProfile(@CurrentUser() user: AuthUser) {
    return this.users.myProfile(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my contact details' })
  @ApiData(UserModel)
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user, dto);
  }

  @Get()
  @RequirePermission(PermissionModule.DRIVERS, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({
    summary: 'All Users Directory (filter by role, status, depot, search)',
  })
  @ApiPage(UserModel)
  findAll(@CurrentUser() user: AuthUser, @Query() q: UserQueryDto) {
    return this.users.findAll(user, q);
  }

  @Get('stats')
  @RequirePermission(PermissionModule.DRIVERS, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'User counts' })
  @ApiData(UserStats)
  stats(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.users.stats(user, businessId);
  }

  @Get('export')
  @RequirePermission(PermissionModule.DRIVERS, 'view')
  @Roles(UserRole.BUSINESS_ADMIN)
  @RawResponse()
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="users.csv"')
  @ApiOperation({ summary: 'Export users as CSV' })
  @ApiCsv()
  export(@CurrentUser() user: AuthUser, @Query() q: UserQueryDto) {
    return this.users.exportCsv(user, q);
  }

  @Post()
  @RequirePermission(PermissionModule.DRIVERS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Add New User (sends invitation)' })
  @ApiData(UserCreated, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }

  @Get(':id')
  @RequirePermission(PermissionModule.DRIVERS, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'User details' })
  @ApiData(UserModel)
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.findOne(user, id);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.DRIVERS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Edit User' })
  @ApiData(UserModel)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.DRIVERS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Deactivate a user (soft delete)' })
  @ApiData(UserModel)
  deactivate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.deactivate(user, id);
  }

  @Post(':id/resend-invitation')
  @RequirePermission(PermissionModule.DRIVERS, 'edit')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Resend the invitation' })
  @ApiData(InvitationResult, { status: 201 })
  resend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.resendInvitation(user, id);
  }

  @Get(':id/access')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Depot scope and permission overrides of a user' })
  @ApiData(UserAccess)
  access(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.access(user, id);
  }

  @Put(':id/access/depots')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Set the depots a user can access' })
  @ApiData(UserAccess)
  depotScope(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DepotScopeDto,
  ) {
    return this.users.setDepotScope(user, id, dto);
  }

  @Put(':id/access/overrides')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Set a time-limited permission override' })
  @ApiData(UserAccess)
  override(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PermissionOverrideDto,
  ) {
    return this.users.setPermissionOverride(user, id, dto);
  }

  @Delete(':id/access/overrides/:module')
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({ summary: 'Remove a permission override' })
  @ApiData(UserAccess)
  removeOverride(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('module', new ParseEnumPipe(PermissionModule))
    module: PermissionModule,
  ) {
    return this.users.removePermissionOverride(user, id, module);
  }

  @Post(':id/mfa/reset')
  @HttpCode(200)
  @Roles(UserRole.BUSINESS_ADMIN)
  @ApiOperation({
    summary:
      'Reset a user authenticator (lost device): removes the authenticator and recovery codes and signs the user out',
  })
  @ApiData(MfaResetResult)
  resetMfa(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetMfaDto,
  ) {
    return this.users.resetMfa(user, id, dto.reason);
  }
}

import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PermissionModule, UserRole } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import { UpdateBusinessSettingsDto } from './dto/settings.dto.js';
import { SettingsService } from './settings.service.js';
import { ApiData } from '../common/swagger/swagger.js';
import { BusinessModel } from '../common/swagger/entities.dto.js';

@ApiTags('Business Settings')
@ApiBearerAuth()
@Roles(UserRole.BUSINESS_ADMIN)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission(PermissionModule.SETTINGS, 'view')
  @ApiOperation({ summary: 'Business Settings' })
  @ApiData(BusinessModel)
  get(@CurrentUser() user: AuthUser, @Query('businessId') businessId?: string) {
    return this.settings.get(user, businessId);
  }

  @Patch()
  @RequirePermission(PermissionModule.SETTINGS, 'edit')
  @ApiOperation({
    summary: 'Save business settings (company info, 2FA policy, time zone)',
  })
  @ApiData(BusinessModel)
  update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateBusinessSettingsDto,
    @Query('businessId') businessId?: string,
  ) {
    return this.settings.update(user, dto, businessId);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiQuery,
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { CreateRoleDto, SaveMatrixDto } from './dto/role.dto.js';
import { RolesService } from './roles.service.js';
import { ApiData } from '../common/swagger/swagger.js';
import { RoleDefinitionModel } from '../common/swagger/entities.dto.js';
import { PermissionMatrix } from '../common/swagger/responses.dto.js';

@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@Roles(UserRole.BUSINESS_ADMIN)
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @ApiQuery({
    name: 'businessId',
    required: false,
    description: 'Super admin only',
  })
  @ApiOperation({ summary: 'Role permission matrix' })
  @ApiData(PermissionMatrix)
  matrix(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.roles.matrix(user, businessId);
  }

  @Post()
  @ApiOperation({ summary: 'Create Role' })
  @ApiData(RoleDefinitionModel, { status: 201 })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    return this.roles.create(user, dto);
  }

  @Put('permissions')
  @ApiQuery({
    name: 'businessId',
    required: false,
    description: 'Super admin only',
  })
  @ApiOperation({ summary: 'Save Permission Changes' })
  @ApiData(PermissionMatrix)
  save(
    @CurrentUser() user: AuthUser,
    @Body() dto: SaveMatrixDto,
    @Query('businessId') businessId?: string,
  ) {
    return this.roles.saveMatrix(user, dto, businessId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a custom role' })
  @ApiData(RoleDefinitionModel)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.roles.remove(user, id);
  }
}

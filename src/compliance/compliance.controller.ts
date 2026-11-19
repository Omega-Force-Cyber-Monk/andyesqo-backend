import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RawResponse } from '../common/decorators/raw-response.decorator.js';
import {
  MANAGERS,
  Roles,
  ROSTER_ROLES,
} from '../common/decorators/roles.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PermissionModule } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import { ComplianceService } from './compliance.service.js';
import {
  ComplianceQueryDto,
  CreateDocumentDto,
  UpdateDocumentDto,
} from './dto/compliance.dto.js';
import { ApiCsv, ApiData, ApiPage } from '../common/swagger/swagger.js';
import { ComplianceDocumentModel } from '../common/swagger/entities.dto.js';
import {
  ComplianceAlert,
  ComplianceDetail,
  ComplianceRow,
} from '../common/swagger/responses.dto.js';

@ApiTags('Roster - Compliance')
@ApiBearerAuth()
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get()
  @RequirePermission(PermissionModule.COMPLIANCE, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({
    summary:
      'Licence / visa / training / documents / fatigue / eligibility per driver',
  })
  @ApiPage(ComplianceRow)
  findAll(@CurrentUser() user: AuthUser, @Query() q: ComplianceQueryDto) {
    return this.compliance.findAll(user, q);
  }

  @Get('export')
  @RequirePermission(PermissionModule.COMPLIANCE, 'view')
  @Roles(...ROSTER_ROLES)
  @RawResponse()
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="compliance.csv"')
  @ApiOperation({ summary: 'Export the compliance report as CSV' })
  @ApiCsv()
  export(@CurrentUser() user: AuthUser, @Query() q: ComplianceQueryDto) {
    return this.compliance.exportCsv(user, q);
  }

  @Get('alerts')
  @RequirePermission(PermissionModule.COMPLIANCE, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Compliance Requires Attention' })
  @ApiData([ComplianceAlert])
  alerts(
    @CurrentUser() user: AuthUser,
    @Query('businessId') businessId?: string,
  ) {
    return this.compliance.alerts(user, businessId);
  }

  @Patch('documents/:docId')
  @RequirePermission(PermissionModule.COMPLIANCE, 'edit')
  @Roles(...ROSTER_ROLES)
  @ApiOperation({ summary: 'Edit Compliance Document' })
  @ApiData(ComplianceDocumentModel)
  updateDocument(
    @CurrentUser() user: AuthUser,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.compliance.updateDocument(user, docId, dto);
  }

  @Delete('documents/:docId')
  @RequirePermission(PermissionModule.COMPLIANCE, 'edit')
  @Roles(...ROSTER_ROLES)
  @ApiOperation({ summary: 'Delete a compliance document' })
  @ApiData(ComplianceDocumentModel)
  removeDocument(
    @CurrentUser() user: AuthUser,
    @Param('docId', ParseUUIDPipe) docId: string,
  ) {
    return this.compliance.removeDocument(user, docId);
  }

  @Get(':userId')
  @RequirePermission(PermissionModule.COMPLIANCE, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Driver compliance details drawer' })
  @ApiData(ComplianceDetail)
  detail(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.compliance.detail(user, userId);
  }

  @Get(':userId/documents')
  @RequirePermission(PermissionModule.COMPLIANCE, 'view')
  @Roles(...MANAGERS)
  @ApiOperation({ summary: "A user's compliance documents" })
  @ApiData([ComplianceDocumentModel])
  documents(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.compliance.documents(user, userId);
  }

  @Post(':userId/documents')
  @RequirePermission(PermissionModule.COMPLIANCE, 'edit')
  @Roles(...ROSTER_ROLES)
  @ApiOperation({ summary: 'Upload a compliance document' })
  @ApiData(ComplianceDocumentModel, { status: 201 })
  addDocument(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.compliance.addDocument(user, userId, dto);
  }
}

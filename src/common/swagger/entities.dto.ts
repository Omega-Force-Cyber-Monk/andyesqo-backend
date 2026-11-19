// Generated from prisma/schema.prisma by scripts/generate-swagger-models.py. Do not edit.
// Response shapes for Swagger; relation fields are present only where an endpoint includes them.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as E from '../../generated/prisma/enums.js';

/** Region record. */
export class RegionModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string', description: 'NSW, VIC ...' })
  code!: string;
  @ApiProperty({ type: 'string', description: 'New South Wales' })
  name!: string;
  @ApiProperty({ type: 'string' })
  country!: string;
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: '"Sydney Metro, Hunter, Central Coast"',
  })
  description!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessRegionModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  businesses?: BusinessRegionModel[];
}

/** Business record. */
export class BusinessModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  name!: string;
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: '"Courier / Logistics / Transport"',
  })
  businessType!: string | null;
  @ApiProperty({ type: 'string', nullable: true, description: 'ABN' })
  businessNumber!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  email!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  contactNumber!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  address!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  supportEmail!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  supportPhone!: string | null;
  @ApiProperty({ enum: E.BusinessStatus, enumName: 'BusinessStatus' })
  status!: E.BusinessStatus;
  @ApiProperty({ type: 'boolean' })
  twoFactorRequired!: boolean;
  @ApiProperty({ type: 'string' })
  timezone!: string;
  @ApiProperty({ type: 'boolean' })
  settingsConfigured!: boolean;
  @ApiProperty({ type: 'boolean' })
  permissionsVerified!: boolean;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessRegionModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  regions?: BusinessRegionModel[];
  @ApiPropertyOptional({
    type: () => DepotModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  depots?: DepotModel[];
  @ApiPropertyOptional({
    type: () => UserModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  users?: UserModel[];
  @ApiPropertyOptional({
    type: () => VehicleModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  vehicles?: VehicleModel[];
  @ApiPropertyOptional({
    type: () => ShiftModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  shifts?: ShiftModel[];
  @ApiPropertyOptional({
    type: () => DeliveryModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  deliveries?: DeliveryModel[];
  @ApiPropertyOptional({
    type: () => DamageTypeModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  damageTypes?: DamageTypeModel[];
  @ApiPropertyOptional({
    type: () => IncidentTypeModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  incidentTypes?: IncidentTypeModel[];
  @ApiPropertyOptional({
    type: () => RoleDefinitionModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  roleDefinitions?: RoleDefinitionModel[];
  @ApiPropertyOptional({
    type: () => AuditLogModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  auditLogs?: AuditLogModel[];
  @ApiPropertyOptional({
    type: () => UploadModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  uploads?: UploadModel[];
}

/** BusinessRegion record. */
export class BusinessRegionModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  businessId!: string;
  @ApiProperty({ type: 'string' })
  regionId!: string;
  @ApiProperty({
    enum: E.BusinessRegionStatus,
    enumName: 'BusinessRegionStatus',
  })
  status!: E.BusinessRegionStatus;
  @ApiProperty({ type: 'string', format: 'date-time' })
  assignedAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessModel,
    description: 'Included by some endpoints',
  })
  business?: BusinessModel;
  @ApiPropertyOptional({
    type: () => RegionModel,
    description: 'Included by some endpoints',
  })
  region?: RegionModel;
}

/** Depot record. */
export class DepotModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  businessId!: string;
  @ApiProperty({ type: 'string', description: 'Sydney Central' })
  name!: string;
  @ApiProperty({ type: 'string', nullable: true })
  address!: string | null;
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'Zone 4 / Sydney CBD Core',
  })
  zone!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessModel,
    description: 'Included by some endpoints',
  })
  business?: BusinessModel;
  @ApiPropertyOptional({
    type: () => UserModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  users?: UserModel[];
  @ApiPropertyOptional({
    type: () => VehicleModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  vehicles?: VehicleModel[];
  @ApiPropertyOptional({
    type: () => ShiftModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  shifts?: ShiftModel[];
  @ApiPropertyOptional({
    type: () => DeliveryModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  deliveries?: DeliveryModel[];
  @ApiPropertyOptional({
    type: () => MaintenanceModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  maintenance?: MaintenanceModel[];
  @ApiPropertyOptional({
    type: () => UserDepotScopeModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  accessScopes?: UserDepotScopeModel[];
}

/** RoleDefinition record. */
export class RoleDefinitionModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'null = platform default template',
  })
  businessId!: string | null;
  @ApiProperty({
    type: 'string',
    description: 'e.g. SUPERVISOR or a custom slug',
  })
  key!: string;
  @ApiProperty({ type: 'string' })
  name!: string;
  @ApiProperty({ type: 'string', nullable: true })
  description!: string | null;
  @ApiProperty({ type: 'boolean' })
  isSystem!: boolean;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  business?: BusinessModel | null;
  @ApiPropertyOptional({
    type: () => RolePermissionModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  permissions?: RolePermissionModel[];
}

/** RolePermission record. */
export class RolePermissionModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  roleDefinitionId!: string;
  @ApiProperty({ enum: E.PermissionModule, enumName: 'PermissionModule' })
  module!: E.PermissionModule;
  @ApiProperty({ type: 'boolean' })
  canView!: boolean;
  @ApiProperty({ type: 'boolean' })
  canEdit!: boolean;
  @ApiPropertyOptional({
    type: () => RoleDefinitionModel,
    description: 'Included by some endpoints',
  })
  roleDefinition?: RoleDefinitionModel;
}

/** User record. */
export class UserModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string', nullable: true })
  businessId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  depotId!: string | null;
  @ApiProperty({ enum: E.UserRole, enumName: 'UserRole' })
  role!: E.UserRole;
  @ApiProperty({ enum: E.UserStatus, enumName: 'UserStatus' })
  status!: E.UserStatus;
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'DRV-10024, AST-1001, SUP-2041 ...',
  })
  employeeId!: string | null;
  @ApiProperty({ type: 'string' })
  email!: string;
  @ApiProperty({ type: 'string', nullable: true })
  phone!: string | null;
  @ApiProperty({ type: 'string' })
  firstName!: string;
  @ApiProperty({ type: 'string', nullable: true })
  lastName!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  avatarUrl!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  dateOfBirth!: Date | null;
  @ApiProperty({ type: 'string', nullable: true })
  emergencyContactName!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  emergencyContactPhone!: string | null;
  @ApiProperty({
    enum: E.EmploymentType,
    enumName: 'EmploymentType',
    nullable: true,
  })
  employmentType!: E.EmploymentType | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  joiningDate!: Date | null;
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: '"Metro Delivery Team A"',
  })
  team!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  supervisorId!: string | null;
  @ApiProperty({ enum: E.ShiftType, enumName: 'ShiftType', nullable: true })
  preferredShift!: E.ShiftType | null;
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: '"MR - Medium Rigid"',
  })
  licenceClass!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  licenceNumber!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  licenceExpiry!: Date | null;
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'Citizen, Work visa ...',
  })
  visaStatus!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  visaExpiry!: Date | null;
  @ApiProperty({ type: 'boolean' })
  twoFactorEnabled!: boolean;
  @ApiProperty({ type: 'boolean' })
  allDepots!: boolean;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  lastLoginAt!: Date | null;
  @ApiProperty({ type: 'string', nullable: true })
  lastLoginIp!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  lastLoginUserAgent!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  business?: BusinessModel | null;
  @ApiPropertyOptional({
    type: () => DepotModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  depot?: DepotModel | null;
  @ApiPropertyOptional({
    type: () => UserModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  supervisor?: UserModel | null;
  @ApiPropertyOptional({
    type: () => UserModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  supervisees?: UserModel[];
  @ApiPropertyOptional({
    type: () => ComplianceDocumentModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  documents?: ComplianceDocumentModel[];
  @ApiPropertyOptional({
    type: () => AvailabilityModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  availability?: AvailabilityModel[];
  @ApiPropertyOptional({
    type: () => VehicleModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  assignedVehicles?: VehicleModel[];
  @ApiPropertyOptional({
    type: () => ShiftModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  driverShifts?: ShiftModel[];
  @ApiPropertyOptional({
    type: () => ShiftModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  assistantShifts?: ShiftModel[];
  @ApiPropertyOptional({
    type: () => AttendanceModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  attendances?: AttendanceModel[];
  @ApiPropertyOptional({
    type: () => InspectionModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  inspections?: InspectionModel[];
  @ApiPropertyOptional({
    type: () => InspectionModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  reviewedInspections?: InspectionModel[];
  @ApiPropertyOptional({
    type: () => DamageReportModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  damageReports?: DamageReportModel[];
  @ApiPropertyOptional({
    type: () => DamageReportModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  reviewedDamageReports?: DamageReportModel[];
  @ApiPropertyOptional({
    type: () => RepairRequestModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  repairRequests?: RepairRequestModel[];
  @ApiPropertyOptional({
    type: () => DeliveryModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  deliveries?: DeliveryModel[];
  @ApiPropertyOptional({
    type: () => DeliveryModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  createdDeliveries?: DeliveryModel[];
  @ApiPropertyOptional({
    type: () => IncidentReportModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  incidents?: IncidentReportModel[];
  @ApiPropertyOptional({
    type: () => FuelLogModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  fuelLogs?: FuelLogModel[];
  @ApiPropertyOptional({
    type: () => MessageModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  sentMessages?: MessageModel[];
  @ApiPropertyOptional({
    type: () => MessageModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  receivedMessages?: MessageModel[];
  @ApiPropertyOptional({
    type: () => NotificationModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  notifications?: NotificationModel[];
  @ApiPropertyOptional({
    type: () => AuditLogModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  auditLogs?: AuditLogModel[];
  @ApiPropertyOptional({
    type: () => VehicleStatusLogModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  vehicleStatusChanges?: VehicleStatusLogModel[];
  @ApiPropertyOptional({
    type: () => DriverLocationModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  locationUpdates?: DriverLocationModel[];
  @ApiPropertyOptional({
    type: () => UserPermissionOverrideModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  permissionOverrides?: UserPermissionOverrideModel[];
  @ApiPropertyOptional({
    type: () => UserDepotScopeModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  depotScopes?: UserDepotScopeModel[];
  @ApiPropertyOptional({
    type: () => UploadModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  uploads?: UploadModel[];
}

/** UserPermissionOverride record. */
export class UserPermissionOverrideModel {
  @ApiProperty({ type: 'string' })
  userId!: string;
  @ApiProperty({ enum: E.PermissionModule, enumName: 'PermissionModule' })
  module!: E.PermissionModule;
  @ApiProperty({ type: 'boolean' })
  canView!: boolean;
  @ApiProperty({ type: 'boolean' })
  canEdit!: boolean;
  @ApiProperty({ type: 'string', format: 'date-time' })
  startsAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  expiresAt!: Date;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  user?: UserModel;
}

/** UserDepotScope record. */
export class UserDepotScopeModel {
  @ApiProperty({ type: 'string' })
  userId!: string;
  @ApiProperty({ type: 'string' })
  depotId!: string;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  user?: UserModel;
  @ApiPropertyOptional({
    type: () => DepotModel,
    description: 'Included by some endpoints',
  })
  depot?: DepotModel;
}

/** DriverLocation record. */
export class DriverLocationModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  driverId!: string;
  @ApiProperty({ type: 'number' })
  latitude!: number;
  @ApiProperty({ type: 'number' })
  longitude!: number;
  @ApiProperty({ type: 'number', nullable: true })
  accuracy!: number | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  recordedAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  driver?: UserModel;
}

/** ComplianceDocument record. */
export class ComplianceDocumentModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  userId!: string;
  @ApiProperty({
    enum: E.ComplianceDocumentType,
    enumName: 'ComplianceDocumentType',
  })
  type!: E.ComplianceDocumentType;
  @ApiProperty({
    type: 'string',
    description: '"Medical Certificate", "Safety Induction", "First Aid"',
  })
  title!: string;
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'licence / document number',
  })
  number!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  issuedAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  expiresAt!: Date | null;
  @ApiProperty({ type: 'string', nullable: true })
  fileUrl!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  notes!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  user?: UserModel;
}

/** Availability record. */
export class AvailabilityModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  userId!: string;
  @ApiProperty({ type: 'string', format: 'date-time' })
  date!: Date;
  @ApiProperty({ enum: E.AvailabilityStatus, enumName: 'AvailabilityStatus' })
  status!: E.AvailabilityStatus;
  @ApiProperty({ type: 'string', nullable: true })
  note!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  user?: UserModel;
}

/** Vehicle record. */
export class VehicleModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  businessId!: string;
  @ApiProperty({ type: 'string', nullable: true })
  depotId!: string | null;
  @ApiProperty({
    type: 'string',
    description: 'VH-1025 (auto-generated if blank)',
  })
  code!: string;
  @ApiProperty({ type: 'string', description: 'ABC-123' })
  registration!: string;
  @ApiProperty({ type: 'string', description: 'Toyota HiAce' })
  model!: string;
  @ApiProperty({ type: 'integer', nullable: true })
  year!: number | null;
  @ApiProperty({ enum: E.VehicleBodyType, enumName: 'VehicleBodyType' })
  bodyType!: E.VehicleBodyType;
  @ApiProperty({ enum: E.FuelType, enumName: 'FuelType' })
  fuelType!: E.FuelType;
  @ApiProperty({ type: 'string', nullable: true, description: '"12 Seats"' })
  capacity!: string | null;
  @ApiProperty({ type: 'integer' })
  odometerKm!: number;
  @ApiProperty({ enum: E.VehicleStatus, enumName: 'VehicleStatus' })
  status!: E.VehicleStatus;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  lastServiceDate!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  nextServiceDate!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  registrationExpiry!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  insuranceExpiry!: Date | null;
  @ApiProperty({ type: 'string', nullable: true })
  assignedDriverId!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessModel,
    description: 'Included by some endpoints',
  })
  business?: BusinessModel;
  @ApiPropertyOptional({
    type: () => DepotModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  depot?: DepotModel | null;
  @ApiPropertyOptional({
    type: () => UserModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  assignedDriver?: UserModel | null;
  @ApiPropertyOptional({
    type: () => ShiftModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  shifts?: ShiftModel[];
  @ApiPropertyOptional({
    type: () => InspectionModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  inspections?: InspectionModel[];
  @ApiPropertyOptional({
    type: () => DamageReportModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  damageReports?: DamageReportModel[];
  @ApiPropertyOptional({
    type: () => RepairRequestModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  repairRequests?: RepairRequestModel[];
  @ApiPropertyOptional({
    type: () => MaintenanceModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  maintenance?: MaintenanceModel[];
  @ApiPropertyOptional({
    type: () => DeliveryModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  deliveries?: DeliveryModel[];
  @ApiPropertyOptional({
    type: () => FuelLogModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  fuelLogs?: FuelLogModel[];
  @ApiPropertyOptional({
    type: () => IncidentReportModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  incidents?: IncidentReportModel[];
  @ApiPropertyOptional({
    type: () => VehicleStatusLogModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  statusLogs?: VehicleStatusLogModel[];
}

/** VehicleStatusLog record. */
export class VehicleStatusLogModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  vehicleId!: string;
  @ApiProperty({ enum: E.VehicleStatus, enumName: 'VehicleStatus' })
  fromStatus!: E.VehicleStatus;
  @ApiProperty({ enum: E.VehicleStatus, enumName: 'VehicleStatus' })
  toStatus!: E.VehicleStatus;
  @ApiProperty({ type: 'string', nullable: true })
  reason!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  changedById!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiPropertyOptional({
    type: () => VehicleModel,
    description: 'Included by some endpoints',
  })
  vehicle?: VehicleModel;
  @ApiPropertyOptional({
    type: () => UserModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  changedBy?: UserModel | null;
}

/** Inspection record. */
export class InspectionModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  vehicleId!: string;
  @ApiProperty({ type: 'string' })
  driverId!: string;
  @ApiProperty({ type: 'string', nullable: true })
  shiftId!: string | null;
  @ApiProperty({ enum: E.InspectionType, enumName: 'InspectionType' })
  type!: E.InspectionType;
  @ApiProperty({ enum: E.InspectionResult, enumName: 'InspectionResult' })
  result!: E.InspectionResult;
  @ApiProperty({ enum: E.InspectionStatus, enumName: 'InspectionStatus' })
  status!: E.InspectionStatus;
  @ApiProperty({ type: 'integer', nullable: true })
  durationSec!: number | null;
  @ApiProperty({ type: 'integer', nullable: true })
  odometerKm!: number | null;
  @ApiProperty({ type: 'string', nullable: true })
  comments!: string | null;
  @ApiProperty({ type: 'string', isArray: true })
  photos!: string[];
  @ApiProperty({ type: 'string', nullable: true })
  reviewedById!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  reviewedAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  submittedAt!: Date;
  @ApiPropertyOptional({
    type: () => VehicleModel,
    description: 'Included by some endpoints',
  })
  vehicle?: VehicleModel;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  driver?: UserModel;
  @ApiPropertyOptional({
    type: () => UserModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  reviewedBy?: UserModel | null;
  @ApiPropertyOptional({
    type: () => ShiftModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  shift?: ShiftModel | null;
  @ApiPropertyOptional({
    type: () => InspectionItemModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  items?: InspectionItemModel[];
  @ApiPropertyOptional({
    type: () => RepairRequestModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  repairRequests?: RepairRequestModel[];
}

/** InspectionItem record. */
export class InspectionItemModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  inspectionId!: string;
  @ApiProperty({
    type: 'string',
    description: 'Tyres, Lights, Mirrors, Brakes ...',
  })
  name!: string;
  @ApiProperty({ enum: E.ChecklistResult, enumName: 'ChecklistResult' })
  result!: E.ChecklistResult;
  @ApiProperty({ type: 'string', nullable: true })
  note!: string | null;
  @ApiPropertyOptional({
    type: () => InspectionModel,
    description: 'Included by some endpoints',
  })
  inspection?: InspectionModel;
}

/** DamageType record. */
export class DamageTypeModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  businessId!: string;
  @ApiProperty({ type: 'string' })
  name!: string;
  @ApiProperty({ type: 'string', nullable: true })
  description!: string | null;
  @ApiProperty({ enum: E.Severity, enumName: 'Severity' })
  defaultSeverity!: E.Severity;
  @ApiProperty({ type: 'boolean' })
  requiresPhoto!: boolean;
  @ApiProperty({ type: 'boolean' })
  autoGroundVehicle!: boolean;
  @ApiProperty({ type: 'boolean' })
  active!: boolean;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessModel,
    description: 'Included by some endpoints',
  })
  business?: BusinessModel;
  @ApiPropertyOptional({
    type: () => DamageReportModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  reports?: DamageReportModel[];
}

/** DamageReport record. */
export class DamageReportModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string', description: 'DR-2048' })
  code!: string;
  @ApiProperty({ type: 'string' })
  vehicleId!: string;
  @ApiProperty({ type: 'string' })
  reportedById!: string;
  @ApiProperty({ type: 'string', nullable: true })
  damageTypeId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  inspectionId!: string | null;
  @ApiProperty({
    enum: E.DamageLocation,
    enumName: 'DamageLocation',
    isArray: true,
  })
  locations!: E.DamageLocation[];
  @ApiProperty({ enum: E.Severity, enumName: 'Severity' })
  severity!: E.Severity;
  @ApiProperty({ type: 'string' })
  description!: string;
  @ApiProperty({ type: 'string', isArray: true })
  photos!: string[];
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  noticedAt!: Date | null;
  @ApiProperty({ enum: E.YesNoUnsure, enumName: 'YesNoUnsure' })
  involvedInAccident!: E.YesNoUnsure;
  @ApiProperty({ type: 'integer', nullable: true })
  odometerKm!: number | null;
  @ApiProperty({ enum: E.DamageReportStatus, enumName: 'DamageReportStatus' })
  status!: E.DamageReportStatus;
  @ApiProperty({ enum: E.Severity, enumName: 'Severity', nullable: true })
  assessedSeverity!: E.Severity | null;
  @ApiProperty({ type: 'string', nullable: true })
  safetyImpact!: string | null;
  @ApiProperty({ type: 'boolean', nullable: true })
  canContinueOperating!: boolean | null;
  @ApiProperty({
    type: 'string',
    format: 'decimal',
    nullable: true,
    example: '650.00',
  })
  estimatedParts!: string | null;
  @ApiProperty({
    type: 'string',
    format: 'decimal',
    nullable: true,
    example: '650.00',
  })
  estimatedLabour!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  reviewedById!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  reviewedAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => VehicleModel,
    description: 'Included by some endpoints',
  })
  vehicle?: VehicleModel;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  reportedBy?: UserModel;
  @ApiPropertyOptional({
    type: () => UserModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  reviewedBy?: UserModel | null;
  @ApiPropertyOptional({
    type: () => DamageTypeModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  damageType?: DamageTypeModel | null;
  @ApiPropertyOptional({
    type: () => RepairRequestModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  repairRequests?: RepairRequestModel[];
}

/** RepairRequest record. */
export class RepairRequestModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string', description: 'REP-1024' })
  code!: string;
  @ApiProperty({ type: 'string' })
  vehicleId!: string;
  @ApiProperty({ type: 'string', nullable: true })
  reportedById!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  damageReportId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  inspectionId!: string | null;
  @ApiProperty({ type: 'string' })
  issue!: string;
  @ApiProperty({ type: 'string', nullable: true })
  description!: string | null;
  @ApiProperty({ enum: E.Priority, enumName: 'Priority' })
  priority!: E.Priority;
  @ApiProperty({ enum: E.RepairStatus, enumName: 'RepairStatus' })
  status!: E.RepairStatus;
  @ApiProperty({ type: 'string', nullable: true })
  provider!: string | null;
  @ApiProperty({
    type: 'string',
    format: 'decimal',
    nullable: true,
    example: '650.00',
  })
  estimatedParts!: string | null;
  @ApiProperty({
    type: 'string',
    format: 'decimal',
    nullable: true,
    example: '650.00',
  })
  estimatedLabour!: string | null;
  @ApiProperty({
    type: 'string',
    format: 'decimal',
    nullable: true,
    example: '650.00',
  })
  actualCost!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  approvedAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  completedAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => VehicleModel,
    description: 'Included by some endpoints',
  })
  vehicle?: VehicleModel;
  @ApiPropertyOptional({
    type: () => UserModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  reportedBy?: UserModel | null;
  @ApiPropertyOptional({
    type: () => DamageReportModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  damageReport?: DamageReportModel | null;
  @ApiPropertyOptional({
    type: () => InspectionModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  inspection?: InspectionModel | null;
}

/** Maintenance record. */
export class MaintenanceModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  vehicleId!: string;
  @ApiProperty({ type: 'string', nullable: true })
  depotId!: string | null;
  @ApiProperty({ enum: E.MaintenanceType, enumName: 'MaintenanceType' })
  type!: E.MaintenanceType;
  @ApiProperty({ enum: E.Priority, enumName: 'Priority' })
  priority!: E.Priority;
  @ApiProperty({ type: 'string', nullable: true })
  description!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  scheduledDate!: Date;
  @ApiProperty({ type: 'string', nullable: true, description: '"09:00"' })
  startTime!: string | null;
  @ApiProperty({ type: 'string', nullable: true, description: '"14:00"' })
  expectedCompletion!: string | null;
  @ApiProperty({ enum: E.ServiceLocationType, enumName: 'ServiceLocationType' })
  locationType!: E.ServiceLocationType;
  @ApiProperty({ type: 'string', nullable: true })
  providerName!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  providerPhone!: string | null;
  @ApiProperty({
    type: 'string',
    format: 'decimal',
    nullable: true,
    example: '650.00',
  })
  estimatedParts!: string | null;
  @ApiProperty({
    type: 'string',
    format: 'decimal',
    nullable: true,
    example: '650.00',
  })
  estimatedLabour!: string | null;
  @ApiProperty({
    type: 'string',
    format: 'decimal',
    nullable: true,
    example: '650.00',
  })
  actualCost!: string | null;
  @ApiProperty({ type: 'number', nullable: true })
  estimatedDowntimeHours!: number | null;
  @ApiProperty({ enum: E.MaintenanceStatus, enumName: 'MaintenanceStatus' })
  status!: E.MaintenanceStatus;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  completedAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => VehicleModel,
    description: 'Included by some endpoints',
  })
  vehicle?: VehicleModel;
  @ApiPropertyOptional({
    type: () => DepotModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  depot?: DepotModel | null;
  @ApiPropertyOptional({
    type: () => MaintenanceTaskModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  tasks?: MaintenanceTaskModel[];
}

/** MaintenanceTask record. */
export class MaintenanceTaskModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  maintenanceId!: string;
  @ApiProperty({ type: 'string' })
  title!: string;
  @ApiProperty({ type: 'boolean' })
  done!: boolean;
  @ApiPropertyOptional({
    type: () => MaintenanceModel,
    description: 'Included by some endpoints',
  })
  maintenance?: MaintenanceModel;
}

/** Shift record. */
export class ShiftModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  businessId!: string;
  @ApiProperty({ type: 'string', nullable: true })
  depotId!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  date!: Date;
  @ApiProperty({ enum: E.ShiftType, enumName: 'ShiftType' })
  type!: E.ShiftType;
  @ApiProperty({ type: 'string', description: '"06:00"' })
  startTime!: string;
  @ApiProperty({ type: 'string', description: '"14:00"' })
  endTime!: string;
  @ApiProperty({ type: 'string', nullable: true })
  breakStart!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  breakEnd!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  driverId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  assistantId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  vehicleId!: string | null;
  @ApiProperty({ enum: E.ShiftStatus, enumName: 'ShiftStatus' })
  status!: E.ShiftStatus;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  publishedAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  startReminderAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  inspectionReminderAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessModel,
    description: 'Included by some endpoints',
  })
  business?: BusinessModel;
  @ApiPropertyOptional({
    type: () => DepotModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  depot?: DepotModel | null;
  @ApiPropertyOptional({
    type: () => UserModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  driver?: UserModel | null;
  @ApiPropertyOptional({
    type: () => UserModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  assistant?: UserModel | null;
  @ApiPropertyOptional({
    type: () => VehicleModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  vehicle?: VehicleModel | null;
  @ApiPropertyOptional({
    type: () => AttendanceModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  attendances?: AttendanceModel[];
  @ApiPropertyOptional({
    type: () => InspectionModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  inspections?: InspectionModel[];
  @ApiPropertyOptional({
    type: () => DeliveryModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  deliveries?: DeliveryModel[];
  @ApiPropertyOptional({
    type: () => FuelLogModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  fuelLogs?: FuelLogModel[];
}

/** Attendance record. */
export class AttendanceModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  shiftId!: string;
  @ApiProperty({ type: 'string' })
  userId!: string;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  clockInAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  clockOutAt!: Date | null;
  @ApiProperty({ type: 'string', nullable: true })
  clockInLocation!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  clockOutLocation!: string | null;
  @ApiProperty({ type: 'number', nullable: true })
  distanceKm!: number | null;
  @ApiProperty({ enum: E.TimesheetStatus, enumName: 'TimesheetStatus' })
  timesheetStatus!: E.TimesheetStatus;
  @ApiProperty({ type: 'string', nullable: true })
  summaryNote!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => ShiftModel,
    description: 'Included by some endpoints',
  })
  shift?: ShiftModel;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  user?: UserModel;
}

/** FuelLog record. */
export class FuelLogModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string', nullable: true })
  shiftId!: string | null;
  @ApiProperty({ type: 'string' })
  userId!: string;
  @ApiProperty({ type: 'string', nullable: true })
  vehicleId!: string | null;
  @ApiProperty({ type: 'boolean', description: 'false = "No fuel today"' })
  refuelled!: boolean;
  @ApiProperty({
    enum: E.FuelEntryType,
    enumName: 'FuelEntryType',
    nullable: true,
  })
  type!: E.FuelEntryType | null;
  @ApiProperty({ type: 'string', nullable: true })
  station!: string | null;
  @ApiProperty({
    type: 'string',
    format: 'decimal',
    nullable: true,
    example: '650.00',
  })
  amountPaid!: string | null;
  @ApiProperty({ type: 'number', nullable: true })
  quantityLitres!: number | null;
  @ApiProperty({ type: 'number', nullable: true })
  energyKwh!: number | null;
  @ApiProperty({ type: 'integer', nullable: true })
  durationMinutes!: number | null;
  @ApiProperty({ type: 'string', isArray: true })
  receiptPhotos!: string[];
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiPropertyOptional({
    type: () => ShiftModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  shift?: ShiftModel | null;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  user?: UserModel;
  @ApiPropertyOptional({
    type: () => VehicleModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  vehicle?: VehicleModel | null;
}

/** Delivery record. */
export class DeliveryModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  businessId!: string;
  @ApiProperty({ type: 'string', description: 'DEL-1024' })
  code!: string;
  @ApiProperty({ type: 'string' })
  customerName!: string;
  @ApiProperty({ type: 'string', nullable: true })
  contactPerson!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  contactPhone!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  contactEmail!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  pickupAddress!: string | null;
  @ApiProperty({ type: 'string' })
  deliveryAddress!: string;
  @ApiProperty({
    type: 'string',
    nullable: true,
    description: 'Operational zone',
  })
  zone!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  depotId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  loadingBay!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  windowStart!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  windowEnd!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  scheduledDropTime!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  eta!: Date | null;
  @ApiProperty({ enum: E.Priority, enumName: 'Priority' })
  priority!: E.Priority;
  @ApiProperty({ enum: E.DeliveryStatus, enumName: 'DeliveryStatus' })
  status!: E.DeliveryStatus;
  @ApiProperty({ type: 'string', nullable: true })
  driverId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  vehicleId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  shiftId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  createdById!: string | null;
  @ApiProperty({ type: 'integer', nullable: true })
  packageCount!: number | null;
  @ApiProperty({ type: 'number', nullable: true })
  totalWeightKg!: number | null;
  @ApiProperty({ type: 'boolean' })
  fragile!: boolean;
  @ApiProperty({ type: 'string', nullable: true })
  specialInstructions!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  barcode!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  delayReason!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  departedAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  startedAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  pickedUpAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  deliveredAt!: Date | null;
  @ApiProperty({ type: 'string', isArray: true })
  pickupPhotos!: string[];
  @ApiProperty({ type: 'string', isArray: true })
  proofPhotos!: string[];
  @ApiProperty({ type: 'string', nullable: true })
  deliveryNotes!: string | null;
  @ApiProperty({ type: 'integer', nullable: true })
  sortOrder!: number | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessModel,
    description: 'Included by some endpoints',
  })
  business?: BusinessModel;
  @ApiPropertyOptional({
    type: () => DepotModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  depot?: DepotModel | null;
  @ApiPropertyOptional({
    type: () => UserModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  driver?: UserModel | null;
  @ApiPropertyOptional({
    type: () => UserModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  createdBy?: UserModel | null;
  @ApiPropertyOptional({
    type: () => VehicleModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  vehicle?: VehicleModel | null;
  @ApiPropertyOptional({
    type: () => ShiftModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  shift?: ShiftModel | null;
  @ApiPropertyOptional({
    type: () => PackageModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  packages?: PackageModel[];
  @ApiPropertyOptional({
    type: () => IncidentReportModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  incidents?: IncidentReportModel[];
  @ApiPropertyOptional({
    type: () => MessageModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  messages?: MessageModel[];
}

/** Package record. */
export class PackageModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  deliveryId!: string;
  @ApiProperty({ type: 'string', description: 'PKG-01' })
  code!: string;
  @ApiProperty({ type: 'string', nullable: true })
  description!: string | null;
  @ApiProperty({ type: 'number', nullable: true })
  weightKg!: number | null;
  @ApiPropertyOptional({
    type: () => DeliveryModel,
    description: 'Included by some endpoints',
  })
  delivery?: DeliveryModel;
}

/** IncidentType record. */
export class IncidentTypeModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  businessId!: string;
  @ApiProperty({ type: 'string' })
  name!: string;
  @ApiProperty({ type: 'string', nullable: true })
  description!: string | null;
  @ApiProperty({ enum: E.Severity, enumName: 'Severity' })
  defaultSeverity!: E.Severity;
  @ApiProperty({ type: 'boolean' })
  requiresSupervisorReview!: boolean;
  @ApiProperty({ type: 'boolean' })
  requiresPoliceReport!: boolean;
  @ApiProperty({ type: 'boolean' })
  requiresSafeWorkNotice!: boolean;
  @ApiProperty({ type: 'boolean' })
  active!: boolean;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessModel,
    description: 'Included by some endpoints',
  })
  business?: BusinessModel;
  @ApiPropertyOptional({
    type: () => IncidentReportModel,
    isArray: true,
    description: 'Included by some endpoints',
  })
  incidents?: IncidentReportModel[];
}

/** IncidentReport record. */
export class IncidentReportModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string', nullable: true })
  incidentTypeId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  deliveryId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  vehicleId!: string | null;
  @ApiProperty({ type: 'string' })
  reportedById!: string;
  @ApiProperty({ type: 'string' })
  description!: string;
  @ApiProperty({ type: 'string', isArray: true })
  photos!: string[];
  @ApiProperty({ type: 'string', nullable: true })
  location!: string | null;
  @ApiProperty({ enum: E.IncidentStatus, enumName: 'IncidentStatus' })
  status!: E.IncidentStatus;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
  @ApiPropertyOptional({
    type: () => IncidentTypeModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  incidentType?: IncidentTypeModel | null;
  @ApiPropertyOptional({
    type: () => DeliveryModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  delivery?: DeliveryModel | null;
  @ApiPropertyOptional({
    type: () => VehicleModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  vehicle?: VehicleModel | null;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  reportedBy?: UserModel;
}

/** Message record. */
export class MessageModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  senderId!: string;
  @ApiProperty({ type: 'string' })
  recipientId!: string;
  @ApiProperty({ type: 'string', nullable: true })
  deliveryId!: string | null;
  @ApiProperty({ type: 'string' })
  body!: string;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  readAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  sender?: UserModel;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  recipient?: UserModel;
  @ApiPropertyOptional({
    type: () => DeliveryModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  delivery?: DeliveryModel | null;
}

/** Notification record. */
export class NotificationModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string' })
  userId!: string;
  @ApiProperty({ enum: E.NotificationType, enumName: 'NotificationType' })
  type!: E.NotificationType;
  @ApiProperty({ type: 'string' })
  title!: string;
  @ApiProperty({ type: 'string' })
  body!: string;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  data!: Record<string, unknown> | null;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  readAt!: Date | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  user?: UserModel;
}

/** AuditLog record. */
export class AuditLogModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string', nullable: true })
  businessId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  actorId!: string | null;
  @ApiProperty({ type: 'string', description: '"Grounded Vehicle (Red-Tag)"' })
  action!: string;
  @ApiProperty({
    type: 'string',
    description: '"Fleet & Safety", "Users & Permissions"',
  })
  module!: string;
  @ApiProperty({ type: 'string', nullable: true })
  targetType!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  targetId!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  details!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  ip!: string | null;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  business?: BusinessModel | null;
  @ApiPropertyOptional({
    type: () => UserModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  actor?: UserModel | null;
}

/** Upload record. */
export class UploadModel {
  @ApiProperty({ type: 'string' })
  id!: string;
  @ApiProperty({ type: 'string', nullable: true })
  businessId!: string | null;
  @ApiProperty({ type: 'string' })
  uploadedById!: string;
  @ApiProperty({ type: 'string' })
  originalName!: string;
  @ApiProperty({ type: 'string' })
  mimeType!: string;
  @ApiProperty({ type: 'integer' })
  size!: number;
  @ApiProperty({ type: 'string' })
  sha256!: string;
  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
  @ApiPropertyOptional({
    type: () => BusinessModel,
    nullable: true,
    description: 'Included by some endpoints',
  })
  business?: BusinessModel | null;
  @ApiPropertyOptional({
    type: () => UserModel,
    description: 'Included by some endpoints',
  })
  uploadedBy?: UserModel;
}

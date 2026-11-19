/**
 * Response shapes for composite endpoints (auth, dashboards, stats, summaries).
 * Entity responses use the generated models in entities.dto.ts.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import * as E from '../../generated/prisma/enums.js';
import {
  AttendanceModel,
  AuditLogModel,
  BusinessModel,
  ComplianceDocumentModel,
  DeliveryModel,
  DriverLocationModel,
  FuelLogModel,
  MaintenanceModel,
  MessageModel,
  RoleDefinitionModel,
  ShiftModel,
  UserModel,
  UserPermissionOverrideModel,
  VehicleModel,
} from './entities.dto.js';

const num = (description?: string, nullable = false) =>
  ApiProperty({ type: 'number', description, nullable });
const str = (description?: string, nullable = false) =>
  ApiProperty({ type: 'string', description, nullable });
const date = (description?: string, nullable = false) =>
  ApiProperty({ type: 'string', format: 'date-time', description, nullable });

// ── Auth ──

export class TokenPair {
  @str('JWT access token (15 minutes)') accessToken!: string;
  @str('Opaque refresh token; rotates on every refresh') refreshToken!: string;
  @ApiProperty({ example: 'Bearer' }) tokenType!: string;
  @ApiProperty({ example: '15m' }) expiresIn!: string;
  @ApiProperty({ type: () => UserModel }) user!: UserModel;
}

export class MfaChallengeResult {
  @ApiProperty({ example: true }) mfaRequired!: boolean;
  @ApiProperty({ description: 'True when no authenticator is enrolled yet' })
  enrollmentRequired!: boolean;
  @str('Five-minute challenge for /auth/mfa/enroll and /auth/mfa/verify')
  challenge!: string;
}

/** Login returns tokens, or an MFA challenge when 2FA applies. */
export class LoginResult {
  @ApiPropertyOptional() accessToken?: string;
  @ApiPropertyOptional() refreshToken?: string;
  @ApiPropertyOptional({ example: 'Bearer' }) tokenType?: string;
  @ApiPropertyOptional({ example: '15m' }) expiresIn?: string;
  @ApiPropertyOptional({ type: () => UserModel }) user?: UserModel;
  @ApiPropertyOptional() mfaRequired?: boolean;
  @ApiPropertyOptional() enrollmentRequired?: boolean;
  @ApiPropertyOptional() challenge?: string;
}

export class MfaEnrollment {
  @str('Base32 secret for manual entry') secret!: string;
  @str('otpauth:// URI to render as a QR code') uri!: string;
}

export class MfaSetupResult extends MfaEnrollment {
  @str('Challenge to confirm with /auth/mfa/verify') challenge!: string;
}

export class RecoveryCodes {
  @ApiProperty({ type: 'string', isArray: true, description: 'Shown once' })
  recoveryCodes!: string[];
}

export class MessageResult {
  @str() message!: string;
  @ApiPropertyOptional({ description: 'Only outside production, for testing' })
  devToken?: string;
}

export class ActivationResult {
  @str() message!: string;
  @ApiProperty({ type: () => UserModel }) user!: UserModel;
}

export class LoggedOut {
  @ApiProperty({ example: true }) loggedOut!: boolean;
}

export class SessionInfo {
  @str() id!: string;
  @str('Client IP address', true) ip!: string | null;
  @str('Browser and OS', true) userAgent!: string | null;
  @date() createdAt!: Date;
  @date() lastAuthenticatedAt!: Date;
  @date() expiresAt!: Date;
  @ApiProperty() mfaVerified!: boolean;
  @ApiProperty({ description: 'The session of this access token' })
  current!: boolean;
}

export class Revoked {
  @ApiProperty({ example: true }) revoked!: boolean;
}

export class InvitationResult {
  @ApiProperty() sent!: boolean;
  @ApiPropertyOptional({ description: 'Only outside production' })
  devToken?: string;
}

export class UserCreated {
  @ApiProperty({ type: () => UserModel }) user!: UserModel;
  @ApiProperty({ type: () => InvitationResult }) invitation!: InvitationResult;
}

export class MfaResetResult {
  @ApiProperty({ example: true }) reset!: boolean;
  @str() userId!: string;
}

// ── Users ──

export class UserStats {
  @num() totalUsers!: number;
  @num() activeDrivers!: number;
  @num() assistants!: number;
  @num() activeAccounts!: number;
}

export class DepotScopeRef {
  @str() depotId!: string;
}

export class UserAccess {
  @str() id!: string;
  @ApiProperty({ description: 'False when limited to depotScopes' })
  allDepots!: boolean;
  @ApiProperty({ type: () => DepotScopeRef, isArray: true })
  depotScopes!: DepotScopeRef[];
  @ApiProperty({ type: () => UserPermissionOverrideModel, isArray: true })
  permissionOverrides!: UserPermissionOverrideModel[];
}

export class Performance {
  @num() deliveries!: number;
  @num('Percent of completed deliveries on time', true)
  onTimeRate!: number | null;
  @num() weeklyHours!: number;
  @num(
    'Percent of rostered shifts in the last 30 days that were attended',
    true,
  )
  attendanceRate!: number | null;
  @num('No rule in the design yet', true) safetyScore!: number | null;
}

export class DayDeliveries {
  @num() total!: number;
  @num() completed!: number;
}

export class MyProfile extends UserModel {
  @ApiProperty({ type: () => VehicleModel, nullable: true })
  assignedVehicle!: VehicleModel | null;
  @ApiProperty({ type: () => ShiftModel, nullable: true })
  todayShift!: ShiftModel | null;
  @ApiProperty({ type: () => DayDeliveries }) todayDeliveries!: DayDeliveries;
  @ApiProperty({ type: () => Performance }) performance!: Performance;
}

// ── Businesses / administrators / roles ──

export class SetupStep {
  @ApiProperty({
    enum: [
      'BUSINESS_CREATED',
      'ADMINISTRATOR',
      'REGIONS',
      'SETTINGS',
      'PERMISSIONS',
      'READY',
    ],
  })
  key!: string;
  @str() label!: string;
  @ApiProperty() done!: boolean;
  @ApiPropertyOptional({ example: 'Assigned' }) status?: string;
}

export class BusinessSetup {
  @ApiProperty({ type: () => SetupStep, isArray: true }) steps!: SetupStep[];
  @ApiProperty({ description: 'Steps 1-5 done: may be marked ACTIVE' })
  prerequisitesMet!: boolean;
  @num() completed!: number;
  @num() total!: number;
  @num() percent!: number;
}

export class BusinessProfile extends BusinessModel {
  @ApiProperty({ type: () => UserModel, nullable: true })
  administrator!: UserModel | null;
  @ApiProperty({ type: () => BusinessSetup }) setup!: BusinessSetup;
}

export class BusinessCreated extends BusinessProfile {
  @ApiPropertyOptional({ type: () => InvitationResult })
  invitation?: InvitationResult;
}

export class BusinessStats {
  @num() total!: number;
  @num('ACTIVE or READY') active!: number;
  @num('PENDING_SETUP or INCOMPLETE') pendingSetup!: number;
  @num() inactive!: number;
}

export class AdministratorStats {
  @num() total!: number;
  @num() active!: number;
  @num() pendingInvitation!: number;
}

export class AdministratorProfile extends UserModel {
  @date('Latest invitation sent', true) lastInvitationAt!: Date | null;
}

export class PermissionModuleInfo {
  @ApiProperty({ enum: E.PermissionModule, enumName: 'PermissionModule' })
  module!: E.PermissionModule;
  @str() name!: string;
  @str() purpose!: string;
}

export class PermissionMatrix {
  @ApiProperty({ type: () => PermissionModuleInfo, isArray: true })
  modules!: PermissionModuleInfo[];
  @ApiProperty({ type: () => RoleDefinitionModel, isArray: true })
  roles!: RoleDefinitionModel[];
}

// ── Fleet ──

export class StatusCount {
  @str() status!: string;
  @num() count!: number;
}

export class VehicleStats {
  @num() total!: number;
  @num() available!: number;
  @num() assigned!: number;
  @num() maintenance!: number;
  @num() unavailable!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  byStatus!: Record<string, number>;
}

export class VehicleAttention {
  @ApiProperty({ type: () => VehicleModel, isArray: true })
  overdueMaintenance!: VehicleModel[];
  @ApiProperty({ type: () => VehicleModel, isArray: true })
  inspectionDue!: VehicleModel[];
}

export class ReadinessItem {
  @str() status!: string;
  @ApiPropertyOptional() detail?: string;
}

export class VehicleDetail extends VehicleModel {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Readiness check: inspection, maintenance, registration, insurance',
  })
  readiness?: Record<string, unknown>;
}

export class ChecklistItemInfo {
  @str() key!: string;
  @str() label!: string;
}

export class Checklist {
  @ApiProperty({ enum: E.InspectionType, enumName: 'InspectionType' })
  type!: E.InspectionType;
  @ApiProperty({ type: 'string', isArray: true }) items!: string[];
}

export class InspectionOverview {
  @num() expected!: number;
  @num() submitted!: number;
  @num() failed!: number;
  @num() pendingReview!: number;
  @num() notSubmitted!: number;
  @num(undefined, true) complianceRate!: number | null;
}

export class Notified {
  @ApiProperty({ example: true }) notified!: boolean;
}

export class ReminderResult {
  @num('Drivers still missing the inspection') pending!: number;
  @num('Reminders sent now (at most one per 30 minutes per shift)')
  reminded!: number;
}

export class DamageStats {
  @num() total!: number;
  @num() needsReview!: number;
  @num() grounded!: number;
  @num() repairRequested!: number;
  @num() resolved!: number;
}

export class RepairStats {
  @num() pendingReview!: number;
  @num() approved!: number;
  @num() inProgress!: number;
  @num() completed!: number;
  @num() rejected!: number;
}

export class MaintenanceStats {
  @num() scheduled!: number;
  @num() overdue!: number;
  @num() inProgress!: number;
  @num() completedThisMonth!: number;
}

export class AvailabilityCheck {
  @ApiProperty({ type: 'object', additionalProperties: true })
  vehicle!: Record<string, unknown>;
  @ApiProperty() available!: boolean;
  @ApiProperty({ type: () => ShiftModel, isArray: true })
  overlaps!: ShiftModel[];
  @ApiProperty({ type: () => ShiftModel, nullable: true })
  nextShift!: ShiftModel | null;
}

export class MaintenanceDetail extends MaintenanceModel {
  @num('Estimated parts + labour') estimatedTotal!: number;
}

// ── Roster / attendance / compliance ──

export class UpcomingShiftGroup {
  @date() date!: Date;
  @str() startTime!: string;
  @str() endTime!: string;
  @str(undefined, true) depot!: string | null;
  @num() drivers!: number;
}

export class TaskCount {
  @num() total!: number;
  @num() completed!: number;
  @num() remaining!: number;
}

export class MyToday {
  @ApiProperty({ type: () => ShiftModel, nullable: true })
  shift!: ShiftModel | null;
  @ApiPropertyOptional({ enum: ['DRIVER', 'ASSISTANT'] }) role?: string;
  @ApiPropertyOptional({ enum: ['PENDING', 'PASSED', 'FAILED'] })
  vehicleCheck?: string;
  @ApiPropertyOptional({ enum: ['NOT_STARTED', 'CLOCKED_IN', 'CLOCKED_OUT'] })
  clock?: string;
  @ApiPropertyOptional({ type: () => AttendanceModel, nullable: true })
  attendance?: AttendanceModel | null;
  @ApiPropertyOptional({ type: () => TaskCount }) tasks?: TaskCount;
  @ApiPropertyOptional({ type: () => DeliveryModel, isArray: true })
  upcomingDeliveries?: DeliveryModel[];
}

export class Percentage {
  @num() count!: number;
  @num() percent!: number;
}

export class AvailabilityOverview {
  @ApiProperty({ type: () => Percentage }) available!: Percentage;
  @ApiProperty({ type: () => Percentage }) rostered!: Percentage;
  @ApiProperty({ type: () => Percentage }) unavailable!: Percentage;
  @ApiProperty({ type: () => Percentage }) onLeave!: Percentage;
}

export class AvailabilityRow {
  @ApiProperty({ type: 'object', additionalProperties: true })
  user!: Record<string, unknown>;
  @ApiProperty({ enum: E.AvailabilityStatus, enumName: 'AvailabilityStatus' })
  availability!: E.AvailabilityStatus;
  @str(undefined, true) note!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  shift!: Record<string, unknown> | null;
  @ApiProperty({ type: () => UserModel, nullable: true })
  pairedWith!: UserModel | null;
  @str() compliance!: string;
  @ApiProperty() eligible!: boolean;
  @ApiProperty({ enum: ['ROSTERED', 'NO_SHIFT'] }) status!: string;
}

export class AvailabilityBoard {
  @date() date!: Date;
  @ApiProperty({ type: () => AvailabilityOverview })
  overview!: AvailabilityOverview;
  @ApiProperty({ type: () => AvailabilityRow, isArray: true })
  rows!: AvailabilityRow[];
}

export class PublishResult {
  @num() published!: number;
}

export class Fatigue {
  @ApiProperty({ enum: ['WITHIN_LIMITS', 'EXCEEDED'] }) status!: string;
  @num() todayHours!: number;
  @num() weeklyHours!: number;
  @num() dailyLimit!: number;
  @num() weeklyLimit!: number;
  @num() remainingToday!: number;
}

const ITEM = ['VALID', 'EXPIRING', 'EXPIRED', 'MISSING', 'NOT_APPLICABLE'];

export class ComplianceResult {
  @ApiProperty({ enum: ITEM }) licence!: string;
  @ApiProperty({ enum: ITEM }) visa!: string;
  @ApiProperty({ enum: ITEM }) training!: string;
  @ApiProperty({ enum: ITEM }) documents!: string;
  @ApiProperty({ type: () => Fatigue }) fatigue!: Fatigue;
  @ApiProperty({ enum: ['COMPLIANT', 'REVIEW', 'NON_COMPLIANT'] })
  overall!: string;
  @ApiProperty() eligible!: boolean;
  @ApiProperty({ type: 'string', isArray: true }) issues!: string[];
}

export class ComplianceRow {
  @ApiProperty({ type: () => UserModel }) user!: UserModel;
  @ApiProperty({ type: () => ComplianceResult }) compliance!: ComplianceResult;
  @ApiProperty() rosteredToday!: boolean;
}

export class ComplianceAlert {
  @ApiProperty({ type: () => UserModel }) user!: UserModel;
  @ApiProperty({ type: 'string', isArray: true }) issues!: string[];
  @str() overall!: string;
}

export class ComplianceDetail {
  @ApiProperty({ type: () => UserModel }) user!: UserModel;
  @ApiProperty({ type: () => ComplianceResult }) compliance!: ComplianceResult;
  @ApiProperty({ type: 'object', additionalProperties: true })
  licence!: Record<string, unknown>;
  @ApiProperty({ type: 'object', additionalProperties: true })
  visa!: Record<string, unknown>;
  @ApiProperty({ type: () => ComplianceDocumentModel, isArray: true })
  training!: ComplianceDocumentModel[];
  @ApiProperty({ type: () => ComplianceDocumentModel, isArray: true })
  documents!: ComplianceDocumentModel[];
}

export class ClockInResult {
  @ApiProperty({ type: () => AttendanceModel }) attendance!: AttendanceModel;
  @ApiProperty({ type: 'object', additionalProperties: true })
  shift!: Record<string, unknown>;
}

export class FuelTotals {
  @num() litres!: number;
  @num() kwh!: number;
  @num() amount!: number;
  @ApiProperty({ type: () => FuelLogModel, isArray: true })
  entries!: FuelLogModel[];
}

export class EndShiftSteps {
  @ApiProperty() fuelReceipt!: boolean;
  @ApiProperty() postShiftInspection!: boolean;
  @ApiProperty() clockOut!: boolean;
}

export class EndShiftSummary {
  @ApiProperty({ type: () => ShiftModel }) shift!: ShiftModel;
  @ApiProperty({ type: () => AttendanceModel, nullable: true })
  attendance!: AttendanceModel | null;
  @num() hoursOnDuty!: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  deliveries!: Record<string, unknown>;
  @num(undefined, true) distanceKm!: number | null;
  @ApiProperty({ type: () => FuelTotals }) fuel!: FuelTotals;
  @str() postShiftInspection!: string;
  @num() damageReportsToday!: number;
  @ApiProperty({ type: () => EndShiftSteps }) steps!: EndShiftSteps;
  @ApiProperty() readyToClockOut!: boolean;
}

export class ClockOutResult {
  @ApiProperty({ type: () => AttendanceModel }) attendance!: AttendanceModel;
  @num() totalHours!: number;
  @num() deliveriesCompleted!: number;
  @ApiProperty({ example: 'SUBMITTED' }) timesheet!: string;
}

export class Timesheet extends AttendanceModel {
  @num() hours!: number;
}

// ── Deliveries / incidents / messages / notifications ──

export class DeliveryStats {
  @num() total!: number;
  @num() completed!: number;
  @num() inProgress!: number;
  @num() pending!: number;
  @num() delayed!: number;
  @num() onTime!: number;
  @num() percentComplete!: number;
  @num(undefined, true) onTimeRate!: number | null;
}

export class MyDeliveries {
  @num() total!: number;
  @num() remaining!: number;
  @ApiProperty({ type: () => DeliveryModel, isArray: true })
  deliveries!: DeliveryModel[];
}

export class PeerVehicle {
  @str() registration!: string;
}

export class Peer {
  @str() id!: string;
  @str() firstName!: string;
  @str(undefined, true) lastName!: string | null;
  @ApiProperty({ enum: E.UserRole, enumName: 'UserRole' }) role!: E.UserRole;
  @str(undefined, true) phone!: string | null;
  @str(undefined, true) employeeId!: string | null;
  @str(undefined, true) avatarUrl!: string | null;
  @ApiProperty({ type: () => PeerVehicle, isArray: true })
  assignedVehicles!: PeerVehicle[];
}

export class Conversation {
  @ApiProperty({ type: () => Peer }) peer!: Peer;
  @ApiProperty({ type: () => MessageModel }) lastMessage!: MessageModel;
  @num() unread!: number;
}

export class Thread {
  @ApiProperty({ type: () => Peer }) peer!: Peer;
  @ApiProperty({ type: () => MessageModel, isArray: true })
  messages!: MessageModel[];
}

export class Marked {
  @num() marked!: number;
}

export class NotificationsDeleted {
  @num() deleted!: number;
}

// ── Locations ──

export class LocationVehicle {
  @str() id!: string;
  @str() registration!: string;
  @str() model!: string;
}

export class ActiveDelivery {
  @str() id!: string;
  @str() code!: string;
  @ApiProperty({ enum: E.DeliveryStatus, enumName: 'DeliveryStatus' })
  status!: E.DeliveryStatus;
  @date(undefined, true) eta!: Date | null;
  @str() deliveryAddress!: string;
  @ApiProperty() onTime!: boolean;
}

export class LiveLocation {
  @str() driverId!: string;
  @num() latitude!: number;
  @num() longitude!: number;
  @num('Metres', true) accuracy!: number | null;
  @date() recordedAt!: Date;
  @ApiProperty({ type: 'object', additionalProperties: true })
  driver!: Record<string, unknown>;
  @num() ageSeconds!: number;
  @ApiProperty({ description: 'Older than 15 minutes' }) stale!: boolean;
  @ApiProperty({ type: () => LocationVehicle, nullable: true })
  vehicle!: LocationVehicle | null;
  @ApiProperty({ type: () => ActiveDelivery, nullable: true })
  activeDelivery!: ActiveDelivery | null;
}

export class Accepted {
  @num() accepted!: number;
}

export class TrackPoint {
  @num() latitude!: number;
  @num() longitude!: number;
  @date() recordedAt!: Date;
}

export class TrackLatest extends TrackPoint {
  @num(undefined, true) accuracy!: number | null;
  @ApiProperty() stale!: boolean;
  @num('Derived from the two latest GPS points', true)
  speedKmh!: number | null;
}

export class DeliveryTrack {
  @ApiProperty({ type: () => DeliveryModel }) delivery!: DeliveryModel;
  @ApiProperty({ type: () => TrackLatest, nullable: true })
  latest!: TrackLatest | null;
  @ApiProperty({ type: () => TrackPoint, isArray: true }) path!: TrackPoint[];
}

export class RouteGeometry {
  @str('Provider encoding, e.g. polyline6') encoding!: string;
  @str() value!: string;
}

export class RouteResult {
  @ApiProperty({ type: () => RouteGeometry }) geometry!: RouteGeometry;
  @num() distanceMetres!: number;
  @num() durationSeconds!: number;
}

export class LocationHistory {
  @ApiProperty({ type: () => DriverLocationModel, isArray: true })
  points!: DriverLocationModel[];
  @str('Pass as cursor for the next page', true) nextCursor!: string | null;
}

// ── Uploads / health ──

export class UploadedFile {
  @str() id!: string;
  @ApiProperty({
    example: '/api/v1/uploads/0b6f3c1e-8a3e-4d4c-9a51-0f4f8f0b8c2d',
  })
  url!: string;
  @str() originalName!: string;
  @ApiProperty({ example: 'image/jpeg' }) mimetype!: string;
  @num('Bytes') size!: number;
}

export class SignedLink {
  @str('Use without a bearer token until expiresAt') url!: string;
  @date() expiresAt!: Date;
}

export class Health {
  @ApiProperty({ example: 'ok' }) status!: string;
  @ApiProperty({ example: 'up' }) database!: string;
  @num() dbLatencyMs!: number;
  @num() uptimeSec!: number;
  @date() timestamp!: string;
}

// ── Dashboards / reports ──

const obj = (description?: string) =>
  ApiProperty({
    type: 'object',
    additionalProperties: true,
    description,
    nullable: true,
  });

export class RosterDashboard {
  @ApiProperty({ type: () => ShiftModel, isArray: true, nullable: true })
  todayRoster!: ShiftModel[] | null;
  @ApiProperty({ type: () => ComplianceAlert, isArray: true, nullable: true })
  complianceAlerts!: ComplianceAlert[] | null;
  @ApiProperty({
    type: () => UpcomingShiftGroup,
    isArray: true,
    nullable: true,
  })
  upcomingShifts!: UpcomingShiftGroup[] | null;
}

export class FleetDashboard {
  @ApiProperty({ type: () => VehicleStats, nullable: true })
  fleetStatus!: VehicleStats | null;
  @ApiProperty({ type: () => VehicleAttention, nullable: true })
  requiresAttention!: VehicleAttention | null;
  @obj('{ newCount, items } (null without INSPECTIONS view)')
  recentDamageReports!: Record<string, unknown> | null;
  @num(undefined, true) repairRequestsPendingReview!: number | null;
  @num(undefined, true) vehiclesBlockedByInspection!: number | null;
  @ApiProperty({ type: () => MaintenanceModel, isArray: true, nullable: true })
  upcomingMaintenance!: MaintenanceModel[] | null;
}

export class SupervisorDashboard {
  @obj('activeDrivers, inTransit, loadingBay, staged, vsYesterday')
  fleetStaffing!: Record<string, unknown>;
  @ApiProperty({ type: () => DeliveryStats, nullable: true })
  deliveries!: DeliveryStats | null;
  @ApiProperty({ type: () => InspectionOverview, nullable: true })
  inspectionOverview!: InspectionOverview | null;
  @obj(
    'delayedDeliveries, failedInspections, pendingInspections, damageReports',
  )
  liveAlerts!: Record<string, unknown>;
}

export class BusinessAdminDashboard {
  @obj('totalUsers, activeDrivers, driversOnShift, vehicles, todayDeliveries')
  cards!: Record<string, unknown>;
  @obj('activeDrivers, activeDeliveries, delayedDeliveries, vehiclesInTransit')
  liveOperations!: Record<string, unknown>;
  @obj('redTagVehicles, failedInspections, delayedDeliveries, pendingReports')
  alerts!: Record<string, unknown>;
}

export class BusinessSetupStatus {
  @str() id!: string;
  @str() name!: string;
  @str(undefined, true) businessType!: string | null;
  @str(undefined, true) admin!: string | null;
  @ApiProperty({ type: 'string', isArray: true }) regions!: string[];
  @ApiProperty({ enum: E.BusinessStatus, enumName: 'BusinessStatus' })
  status!: E.BusinessStatus;
}

export class PlatformDashboard {
  @obj(
    'totalBusinesses, activeBusinesses, administrators, regionsCovered, pendingSetup',
  )
  cards!: Record<string, unknown>;
  @ApiProperty({ type: () => BusinessSetupStatus, isArray: true })
  businessSetupStatus!: BusinessSetupStatus[];
  @ApiProperty({ type: () => AuditLogModel, isArray: true })
  recentActivity!: AuditLogModel[];
}

export class OperationsReport {
  @obj('gte / lte of the reported range') range!: Record<string, unknown>;
  @obj('percent, onTime, total') fleetOnTimeRate!: Record<string, unknown>;
  @obj('percent, submitted, expected')
  inspectionSubmissionRate!: Record<string, unknown>;
  @num() redTagGroundings!: number;
  @num(undefined, true) averageDropTimeMin!: number | null;
  @obj('total, onTime, delayed, completed, pending')
  deliveryBreakdown!: Record<string, unknown>;
  @obj('expected, approved, pendingSignOff, failed')
  inspectionLogs!: Record<string, unknown>;
  @num() damageIncidentTickets!: number;
}

export class LiveDriverRow {
  @ApiProperty({ type: 'object', additionalProperties: true })
  driver!: Record<string, unknown>;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  vehicle!: Record<string, unknown> | null;
  @str(undefined, true) depot!: string | null;
  @ApiProperty({ enum: ['ON_ROUTE', 'AT_DEPOT'] }) status!: string;
  @ApiProperty({ type: () => DayDeliveries }) deliveries!: DayDeliveries;
  @num(undefined, true) onTimeRate!: number | null;
  @date() lastUpdate!: Date;
}

export class LiveDrivers {
  @num() activeDrivers!: number;
  @ApiProperty({ type: () => LiveDriverRow, isArray: true })
  rows!: LiveDriverRow[];
}

export class DriverOverview {
  @ApiProperty({ type: () => UserModel }) profile!: UserModel;
  @obj('scheduled, checkIn, checkOut, status') checkInOut!: Record<
    string,
    unknown
  > | null;
  @obj('depot, vehicle') allocation!: Record<string, unknown>;
  @obj('assigned, completed, remaining') todayDeliveries!: Record<
    string,
    unknown
  >;
  @ApiProperty({ type: () => ComplianceResult, nullable: true })
  compliance!: ComplianceResult | null;
  @obj(
    'totalDeliveries, completed, onTime, delayed, averageDeliveryTimeMin, onTimeRate',
  )
  performance!: Record<string, unknown>;
  @ApiProperty({ type: () => DeliveryModel, isArray: true, nullable: true })
  deliveryHistory!: DeliveryModel[] | null;
}

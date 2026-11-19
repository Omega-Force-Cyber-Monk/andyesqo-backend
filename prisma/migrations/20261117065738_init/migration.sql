-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'BUSINESS_ADMIN', 'SUPERVISOR', 'FLEET_MANAGER', 'ROSTER_MANAGER', 'DRIVER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_INVITE', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CASUAL', 'CONTRACT');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('INVITATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('PENDING_SETUP', 'INCOMPLETE', 'READY', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BusinessRegionStatus" AS ENUM ('READY', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PermissionModule" AS ENUM ('DASHBOARD', 'DELIVERIES', 'DRIVERS', 'LIVE_MAP', 'VEHICLES', 'INSPECTIONS', 'REPAIRS', 'MAINTENANCE', 'ROSTER', 'COMPLIANCE', 'REPORTS', 'COMMUNICATION', 'DEPOTS', 'SETTINGS', 'AUDIT');

-- CreateEnum
CREATE TYPE "VehicleBodyType" AS ENUM ('VAN', 'TRUCK', 'BUS', 'MINIBUS', 'UTE', 'OTHER');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('DIESEL', 'PETROL', 'EV', 'HYBRID', 'OTHER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'IN_SERVICE', 'MAINTENANCE', 'UNAVAILABLE', 'INSPECTION_REQUIRED', 'REPAIR_REQUIRED', 'GROUNDED');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('OPEN', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ComplianceDocumentType" AS ENUM ('DRIVER_LICENCE', 'VISA', 'MEDICAL_CERTIFICATE', 'POLICE_CHECK', 'TRAINING', 'EMPLOYMENT_CONTRACT', 'EMERGENCY_CONTACT', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('PRE_SHIFT', 'POST_SHIFT');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED', 'ISSUES_REPORTED');

-- CreateEnum
CREATE TYPE "ChecklistResult" AS ENUM ('GOOD', 'ISSUE');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('MINOR', 'MODERATE', 'MAJOR', 'SEVERE', 'CRITICAL', 'UNSAFE');

-- CreateEnum
CREATE TYPE "DamageLocation" AS ENUM ('FRONT', 'REAR', 'LEFT_SIDE', 'RIGHT_SIDE', 'INTERIOR');

-- CreateEnum
CREATE TYPE "YesNoUnsure" AS ENUM ('YES', 'NO', 'NOT_SURE');

-- CreateEnum
CREATE TYPE "DamageReportStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REPAIR_REQUESTED', 'GROUNDED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('ROUTINE_SERVICE', 'PREVENTIVE_MAINTENANCE', 'BRAKE_INSPECTION', 'TYRE_REPLACEMENT', 'OIL_CHANGE', 'BATTERY_SERVICE', 'MECHANICAL_REPAIR', 'ELECTRICAL_REPAIR', 'SAFETY_INSPECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceLocationType" AS ENUM ('DEPOT', 'EXTERNAL_SERVICE_CENTRE', 'MOBILE_MECHANIC');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PICKED_UP', 'DELAYED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FuelEntryType" AS ENUM ('DIESEL', 'PETROL', 'EV_CHARGING', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SHIFT', 'DELIVERY', 'INSPECTION', 'DAMAGE', 'REPAIR', 'MAINTENANCE', 'COMPLIANCE', 'ROSTER', 'MESSAGE', 'BUSINESS', 'SYSTEM');

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Australia',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessType" TEXT,
    "businessNumber" TEXT,
    "email" TEXT,
    "contactNumber" TEXT,
    "address" TEXT,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "status" "BusinessStatus" NOT NULL DEFAULT 'PENDING_SETUP',
    "twoFactorRequired" BOOLEAN NOT NULL DEFAULT false,
    "settingsConfigured" BOOLEAN NOT NULL DEFAULT false,
    "permissionsVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessRegion" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "status" "BusinessRegionStatus" NOT NULL DEFAULT 'READY',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depot" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "zone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Depot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("businessId","key")
);

-- CreateTable
CREATE TABLE "RoleDefinition" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleDefinitionId" TEXT NOT NULL,
    "module" "PermissionModule" NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "depotId" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_INVITE',
    "employeeId" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "passwordHash" TEXT,
    "avatarUrl" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "employmentType" "EmploymentType",
    "joiningDate" TIMESTAMP(3),
    "team" TEXT,
    "supervisorId" TEXT,
    "preferredShift" "ShiftType",
    "licenceClass" TEXT,
    "licenceNumber" TEXT,
    "licenceExpiry" TIMESTAMP(3),
    "visaStatus" TEXT,
    "visaExpiry" TIMESTAMP(3),
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "lastLoginUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ComplianceDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "number" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AvailabilityStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "depotId" TEXT,
    "code" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "bodyType" "VehicleBodyType" NOT NULL DEFAULT 'VAN',
    "fuelType" "FuelType" NOT NULL DEFAULT 'DIESEL',
    "capacity" TEXT,
    "odometerKm" INTEGER NOT NULL DEFAULT 0,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "lastServiceDate" TIMESTAMP(3),
    "nextServiceDate" TIMESTAMP(3),
    "registrationExpiry" TIMESTAMP(3),
    "insuranceExpiry" TIMESTAMP(3),
    "assignedDriverId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleStatusLog" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "fromStatus" "VehicleStatus" NOT NULL,
    "toStatus" "VehicleStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "shiftId" TEXT,
    "type" "InspectionType" NOT NULL,
    "result" "InspectionResult" NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "durationSec" INTEGER,
    "odometerKm" INTEGER,
    "comments" TEXT,
    "photos" TEXT[],
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionItem" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "result" "ChecklistResult" NOT NULL,
    "note" TEXT,

    CONSTRAINT "InspectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamageType" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultSeverity" "Severity" NOT NULL DEFAULT 'MODERATE',
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "autoGroundVehicle" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DamageType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamageReport" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "damageTypeId" TEXT,
    "inspectionId" TEXT,
    "locations" "DamageLocation"[],
    "severity" "Severity" NOT NULL,
    "description" TEXT NOT NULL,
    "photos" TEXT[],
    "noticedAt" TIMESTAMP(3),
    "involvedInAccident" "YesNoUnsure" NOT NULL DEFAULT 'NO',
    "odometerKm" INTEGER,
    "status" "DamageReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "assessedSeverity" "Severity",
    "safetyImpact" TEXT,
    "canContinueOperating" BOOLEAN,
    "estimatedParts" DECIMAL(10,2),
    "estimatedLabour" DECIMAL(10,2),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DamageReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "reportedById" TEXT,
    "damageReportId" TEXT,
    "inspectionId" TEXT,
    "issue" TEXT NOT NULL,
    "description" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "RepairStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "provider" TEXT,
    "estimatedParts" DECIMAL(10,2),
    "estimatedLabour" DECIMAL(10,2),
    "actualCost" DECIMAL(10,2),
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Maintenance" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "depotId" TEXT,
    "type" "MaintenanceType" NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "expectedCompletion" TEXT,
    "locationType" "ServiceLocationType" NOT NULL DEFAULT 'EXTERNAL_SERVICE_CENTRE',
    "providerName" TEXT,
    "providerPhone" TEXT,
    "estimatedParts" DECIMAL(10,2),
    "estimatedLabour" DECIMAL(10,2),
    "actualCost" DECIMAL(10,2),
    "estimatedDowntimeHours" DOUBLE PRECISION,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTask" (
    "id" TEXT NOT NULL,
    "maintenanceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MaintenanceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "depotId" TEXT,
    "date" DATE NOT NULL,
    "type" "ShiftType" NOT NULL DEFAULT 'MORNING',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakStart" TEXT,
    "breakEnd" TEXT,
    "driverId" TEXT,
    "assistantId" TEXT,
    "vehicleId" TEXT,
    "status" "ShiftStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clockInAt" TIMESTAMP(3),
    "clockOutAt" TIMESTAMP(3),
    "clockInLocation" TEXT,
    "clockOutLocation" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "timesheetStatus" "TimesheetStatus" NOT NULL DEFAULT 'OPEN',
    "summaryNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelLog" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "refuelled" BOOLEAN NOT NULL DEFAULT true,
    "type" "FuelEntryType",
    "station" TEXT,
    "amountPaid" DECIMAL(10,2),
    "quantityLitres" DOUBLE PRECISION,
    "energyKwh" DOUBLE PRECISION,
    "durationMinutes" INTEGER,
    "receiptPhotos" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "pickupAddress" TEXT,
    "deliveryAddress" TEXT NOT NULL,
    "zone" TEXT,
    "depotId" TEXT,
    "loadingBay" TEXT,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "scheduledDropTime" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "driverId" TEXT,
    "vehicleId" TEXT,
    "shiftId" TEXT,
    "createdById" TEXT,
    "packageCount" INTEGER,
    "totalWeightKg" DOUBLE PRECISION,
    "fragile" BOOLEAN NOT NULL DEFAULT false,
    "specialInstructions" TEXT,
    "barcode" TEXT,
    "delayReason" TEXT,
    "departedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "pickupPhotos" TEXT[],
    "proofPhotos" TEXT[],
    "deliveryNotes" TEXT,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "weightKg" DOUBLE PRECISION,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentType" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultSeverity" "Severity" NOT NULL DEFAULT 'MODERATE',
    "requiresSupervisorReview" BOOLEAN NOT NULL DEFAULT false,
    "requiresPoliceReport" BOOLEAN NOT NULL DEFAULT false,
    "requiresSafeWorkNotice" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentReport" (
    "id" TEXT NOT NULL,
    "incidentTypeId" TEXT,
    "deliveryId" TEXT,
    "vehicleId" TEXT,
    "reportedById" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photos" TEXT[],
    "location" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRegion_businessId_regionId_key" ON "BusinessRegion"("businessId", "regionId");

-- CreateIndex
CREATE UNIQUE INDEX "Depot_businessId_name_key" ON "Depot"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RoleDefinition_businessId_key_key" ON "RoleDefinition"("businessId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleDefinitionId_module_key" ON "RolePermission"("roleDefinitionId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_businessId_role_idx" ON "User"("businessId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "User_businessId_employeeId_key" ON "User"("businessId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserToken_tokenHash_key" ON "UserToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UserToken_userId_type_idx" ON "UserToken"("userId", "type");

-- CreateIndex
CREATE INDEX "ComplianceDocument_userId_type_idx" ON "ComplianceDocument"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_userId_date_key" ON "Availability"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_businessId_registration_key" ON "Vehicle"("businessId", "registration");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_businessId_code_key" ON "Vehicle"("businessId", "code");

-- CreateIndex
CREATE INDEX "Inspection_vehicleId_submittedAt_idx" ON "Inspection"("vehicleId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DamageType_businessId_name_key" ON "DamageType"("businessId", "name");

-- CreateIndex
CREATE INDEX "DamageReport_vehicleId_createdAt_idx" ON "DamageReport"("vehicleId", "createdAt");

-- CreateIndex
CREATE INDEX "Maintenance_vehicleId_scheduledDate_idx" ON "Maintenance"("vehicleId", "scheduledDate");

-- CreateIndex
CREATE INDEX "Shift_businessId_date_idx" ON "Shift"("businessId", "date");

-- CreateIndex
CREATE INDEX "Shift_driverId_date_idx" ON "Shift"("driverId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_shiftId_userId_key" ON "Attendance"("shiftId", "userId");

-- CreateIndex
CREATE INDEX "Delivery_businessId_status_idx" ON "Delivery"("businessId", "status");

-- CreateIndex
CREATE INDEX "Delivery_driverId_scheduledDropTime_idx" ON "Delivery"("driverId", "scheduledDropTime");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_businessId_code_key" ON "Delivery"("businessId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentType_businessId_name_key" ON "IncidentType"("businessId", "name");

-- CreateIndex
CREATE INDEX "Message_senderId_recipientId_createdAt_idx" ON "Message"("senderId", "recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessRegion" ADD CONSTRAINT "BusinessRegion_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRegion" ADD CONSTRAINT "BusinessRegion_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depot" ADD CONSTRAINT "Depot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleDefinition" ADD CONSTRAINT "RoleDefinition_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "RoleDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleStatusLog" ADD CONSTRAINT "VehicleStatusLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleStatusLog" ADD CONSTRAINT "VehicleStatusLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionItem" ADD CONSTRAINT "InspectionItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageType" ADD CONSTRAINT "DamageType_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamageReport" ADD CONSTRAINT "DamageReport_damageTypeId_fkey" FOREIGN KEY ("damageTypeId") REFERENCES "DamageType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_damageReportId_fkey" FOREIGN KEY ("damageReportId") REFERENCES "DamageReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTask" ADD CONSTRAINT "MaintenanceTask_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "Maintenance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLog" ADD CONSTRAINT "FuelLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentType" ADD CONSTRAINT "IncidentType_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_incidentTypeId_fkey" FOREIGN KEY ("incidentTypeId") REFERENCES "IncidentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

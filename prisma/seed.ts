/**
 * Demo data for local development: `npm run db:seed`
 * Safe to run more than once: it stops if the demo business already exists.
 * All demo accounts use the password in SEED_PASSWORD (default: Password123).
 */
import 'dotenv/config';
import { localDate } from '../src/common/utils/tenant.js';
import { zonedDateTime } from '../src/common/utils/timezone.js';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  ChecklistResult,
  ComplianceDocumentType,
  DeliveryStatus,
  EmploymentType,
  InspectionResult,
  InspectionType,
  MaintenanceType,
  NotificationType,
  Priority,
  Severity,
  ShiftStatus,
  ShiftType,
  UserRole,
  UserStatus,
  VehicleBodyType,
  VehicleStatus,
  FuelType,
  DamageLocation,
  DamageReportStatus,
  RepairStatus,
  BusinessStatus,
} from '../src/generated/prisma/enums.js';
import {
  defaultPermissionRows,
  DEFAULT_ROLE_PERMISSIONS,
} from '../src/roles/default-permissions.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const DAY = 86400000;
// Demo businesses use the default time zone; "today" is the local date there.
const SEED_TZ = 'Australia/Sydney';
const today = localDate(new Date(), SEED_TZ);
const at = (h: number, m = 0, base = today) =>
  zonedDateTime(
    base,
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    SEED_TZ,
  );
const days = (n: number) => new Date(today.getTime() + n * DAY);

async function code(businessId: string, key: string, start = 1000) {
  const c = await prisma.counter.upsert({
    where: { businessId_key: { businessId, key } },
    create: { businessId, key, value: start + 1 },
    update: { value: { increment: 1 } },
  });
  return `${key}-${c.value}`;
}

async function main() {
  const password = await bcrypt.hash(
    process.env.SEED_PASSWORD ?? 'Password123',
    10,
  );

  // ── Regions (Australian states from the design) ──
  const regionData = [
    ['NSW', 'New South Wales', 'Sydney Metro, Hunter, Central Coast'],
    ['VIC', 'Victoria', 'Melbourne Metro, Geelong, Ballarat'],
    ['QLD', 'Queensland', 'Brisbane, Gold Coast, Sunshine Coast'],
    ['WA', 'Western Australia', 'Perth Metro, Peel'],
    ['SA', 'South Australia', 'Adelaide Metro'],
    ['TAS', 'Tasmania', 'Hobart, Launceston'],
    ['ACT', 'Australian Capital Territory', 'Canberra'],
    ['NT', 'Northern Territory', 'Darwin'],
  ] as const;
  const regions: Record<string, string> = {};
  for (const [c, name, description] of regionData) {
    const r = await prisma.region.upsert({
      where: { code: c },
      create: { code: c, name, description },
      update: {},
    });
    regions[c] = r.id;
  }

  // ── Platform super admin + default role templates ──
  await prisma.user.upsert({
    where: { email: 'superadmin@andyesqo.test' },
    create: {
      email: 'superadmin@andyesqo.test',
      firstName: 'Alexander',
      lastName: 'Wright',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash: password,
    },
    update: {},
  });
  for (const [key, def] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const existing = await prisma.roleDefinition.findFirst({
      where: { businessId: null, key },
    });
    if (!existing) {
      await prisma.roleDefinition.create({
        data: {
          key,
          name: def.name,
          isSystem: true,
          permissions: { create: defaultPermissionRows(key) },
        },
      });
    }
  }

  if (await prisma.business.findFirst({ where: { name: 'N&A Service' } })) {
    console.log('Demo business already exists, skipping the rest of the seed.');
    return;
  }

  // ── Demo business ──
  const biz = await prisma.business.create({
    data: {
      name: 'N&A Service',
      businessType: 'Courier / Logistics / Transport',
      businessNumber: '51 829 104 330',
      email: 'ops@nandaservices.test',
      contactNumber: '+61 2 9555 0100',
      supportEmail: 'admin@nandaservices.test',
      supportPhone: '+61 2 9555 0100',
      address: '42 Harbour View Boulevard, Sydney NSW 2000, Australia',
      status: BusinessStatus.ACTIVE,
      settingsConfigured: true,
      permissionsVerified: true,
      regions: {
        create: [{ regionId: regions.NSW }, { regionId: regions.VIC }],
      },
    },
  });
  for (const [key, def] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    await prisma.roleDefinition.create({
      data: {
        businessId: biz.id,
        key,
        name: def.name,
        isSystem: true,
        permissions: { create: defaultPermissionRows(key) },
      },
    });
  }
  // A second business still in setup (for the platform dashboard).
  await prisma.business.create({
    data: {
      name: 'FastMove Transport',
      businessType: 'Express Courier & Parcel',
      email: 'dispatch@fastmove.test',
      address: '110 Industrial Drive, Melbourne VIC 3000, Australia',
      status: BusinessStatus.INCOMPLETE,
      regions: { create: [{ regionId: regions.VIC }] },
    },
  });

  const [sydney, melbourne, brisbane] = await Promise.all([
    prisma.depot.create({
      data: {
        businessId: biz.id,
        name: 'Sydney Central',
        address: 'Sydney Depot, Parramatta Rd',
        zone: 'Zone 4',
      },
    }),
    prisma.depot.create({
      data: {
        businessId: biz.id,
        name: 'Melbourne West',
        address: '15 Dock Rd, Footscray VIC',
      },
    }),
    prisma.depot.create({
      data: {
        businessId: biz.id,
        name: 'Brisbane North',
        address: '8 Gateway Dr, Brisbane QLD',
      },
    }),
  ]);

  const user = (
    role: UserRole,
    employeeId: string,
    firstName: string,
    lastName: string,
    email: string,
    extra: Record<string, unknown> = {},
  ) =>
    prisma.user.create({
      data: {
        businessId: biz.id,
        depotId: sydney.id,
        role,
        employeeId,
        firstName,
        lastName,
        email,
        phone: '+61 412 345 678',
        status: UserStatus.ACTIVE,
        passwordHash: password,
        employmentType: EmploymentType.FULL_TIME,
        joiningDate: new Date('2022-02-03'),
        ...extra,
      },
    });

  const admin = await user(
    UserRole.BUSINESS_ADMIN,
    'ADM-001',
    'John',
    'Smith',
    'admin@nanda.test',
  );
  const supervisor = await user(
    UserRole.SUPERVISOR,
    'SUP-2041',
    'Pranto',
    'Saha',
    'supervisor@nanda.test',
  );
  await user(
    UserRole.FLEET_MANAGER,
    'FLT-3012',
    'David',
    'Wilson',
    'fleet@nanda.test',
  );
  await user(
    UserRole.ROSTER_MANAGER,
    'ROS-1001',
    'Sarah',
    'Mitchell',
    'roster@nanda.test',
  );
  const driverExtra = (licenceExpiry: Date) => ({
    licenceClass: 'MR - Medium Rigid',
    licenceNumber: 'L1024AU',
    licenceExpiry,
    visaStatus: 'Citizen',
    team: 'Metro Delivery Team A',
    supervisorId: supervisor.id,
    preferredShift: ShiftType.MORNING,
    dateOfBirth: new Date('1988-03-14'),
    emergencyContactName: 'Anna Mitchell',
    emergencyContactPhone: '+61 499 765 432',
  });
  const john = await user(
    UserRole.DRIVER,
    'DRV-10024',
    'John',
    'Mitchell',
    'driver@nanda.test',
    driverExtra(days(365)),
  );
  const sarahW = await user(
    UserRole.DRIVER,
    'DRV-002',
    'Sarah',
    'Wilson',
    'sarah.wilson@nanda.test',
    driverExtra(days(400)),
  );
  const michael = await user(
    UserRole.DRIVER,
    'DRV-003',
    'Michael',
    'Brown',
    'michael.brown@nanda.test',
    driverExtra(days(7)),
  );
  const emma = await user(
    UserRole.DRIVER,
    'DRV-004',
    'Emma',
    'Taylor',
    'emma.taylor@nanda.test',
    {
      ...driverExtra(days(500)),
      depotId: melbourne.id,
    },
  );
  const apurba = await user(
    UserRole.ASSISTANT,
    'AST-001',
    'Apurba',
    'Roy',
    'assistant@nanda.test',
    { visaStatus: 'Citizen' },
  );
  await user(
    UserRole.ASSISTANT,
    'AST-002',
    'Himu',
    'Ahmed',
    'himu@nanda.test',
    { visaStatus: 'Citizen' },
  );
  // Invited but not yet activated
  await prisma.user.create({
    data: {
      businessId: biz.id,
      role: UserRole.DRIVER,
      employeeId: 'DRV-8838',
      firstName: 'Michael',
      lastName: 'Torres',
      email: 'michael.torres@nanda.test',
      status: UserStatus.PENDING_INVITE,
    },
  });

  // Compliance documents
  for (const u of [john, sarahW, michael, emma, apurba]) {
    await prisma.complianceDocument.createMany({
      data: [
        {
          userId: u.id,
          type: ComplianceDocumentType.MEDICAL_CERTIFICATE,
          title: 'Medical Certificate',
          expiresAt: days(470),
        },
        {
          userId: u.id,
          type: ComplianceDocumentType.POLICE_CHECK,
          title: 'Police Check',
          expiresAt: days(900),
        },
        {
          userId: u.id,
          type: ComplianceDocumentType.TRAINING,
          title: 'Safety Induction',
          expiresAt: days(420),
        },
        {
          userId: u.id,
          type: ComplianceDocumentType.TRAINING,
          title: 'Defensive Driving',
          expiresAt: days(470),
        },
        {
          userId: u.id,
          type: ComplianceDocumentType.TRAINING,
          title: 'First Aid',
          expiresAt: u.id === sarahW.id ? days(10) : days(280),
        },
      ],
    });
  }

  // ── Vehicles ──
  const vehicle = async (
    registration: string,
    model: string,
    bodyType: VehicleBodyType,
    extra: Record<string, unknown> = {},
  ) =>
    prisma.vehicle.create({
      data: {
        businessId: biz.id,
        depotId: sydney.id,
        code: await code(biz.id, 'VH'),
        registration,
        model,
        bodyType,
        year: 2022,
        fuelType: FuelType.DIESEL,
        capacity: '12 Seats',
        odometerKm: 84220,
        lastServiceDate: days(-60),
        nextServiceDate: days(30),
        registrationExpiry: days(700),
        insuranceExpiry: days(200),
        ...extra,
      },
    });
  const hiace = await vehicle('ABC-123', 'Toyota HiAce', VehicleBodyType.VAN, {
    status: VehicleStatus.ASSIGNED,
    assignedDriverId: john.id,
  });
  const transit = await vehicle(
    'DEF-456',
    'Ford Transit',
    VehicleBodyType.VAN,
    { status: VehicleStatus.ASSIGNED, assignedDriverId: sarahW.id },
  );
  const isuzu = await vehicle('GHI-789', 'Isuzu NPR', VehicleBodyType.TRUCK, {
    depotId: melbourne.id,
  });
  const sprinter = await vehicle(
    'JKL-321',
    'Mercedes-Benz Sprinter',
    VehicleBodyType.VAN,
    { nextServiceDate: days(-5) },
  );
  await vehicle('MNO-654', 'Hyundai iLoad', VehicleBodyType.VAN, {
    status: VehicleStatus.MAINTENANCE,
    depotId: brisbane.id,
  });

  // ── Damage & incident categories (from the admin config screens) ──
  await prisma.damageType.createMany({
    data: [
      [
        'Scratch',
        Severity.MINOR,
        'Surface paint or panel scratch without severe metal deformation',
      ],
      [
        'Dent',
        Severity.MODERATE,
        'Shallow or deep panel indentation without puncturing structural shell',
      ],
      [
        'Crack',
        Severity.MODERATE,
        'Fracture in fiberglass, plastic fairing, bumper clip, or composite panels',
      ],
      [
        'Broken Mirror',
        Severity.MODERATE,
        'Cracked, shattered, or missing driver/passenger side wing mirror assembly',
      ],
      [
        'Broken Light',
        Severity.SEVERE,
        'Inoperative, smashed, or fractured headlight, tail light, indicator, or brake lamp',
      ],
      [
        'Bumper Damage',
        Severity.MODERATE,
        'Dislodged, crushed, cracked, or detached front or rear bumper bar',
      ],
      [
        'Tyre Damage',
        Severity.CRITICAL,
        'Puncture, sidewall bulge, blowout, excessive tread wear, or valve failure',
      ],
      [
        'Mechanical Damage',
        Severity.CRITICAL,
        'Engine knocking, transmission slippage, power steering failure, or oil leak',
      ],
    ].map(([name, defaultSeverity, description]) => ({
      businessId: biz.id,
      name: name as string,
      defaultSeverity: defaultSeverity as Severity,
      description: description as string,
      requiresPhoto: true,
      autoGroundVehicle: defaultSeverity === Severity.CRITICAL,
    })),
  });
  await prisma.incidentType.createMany({
    data: [
      [
        'Vehicle Accident',
        Severity.CRITICAL,
        'Road traffic collision involving other vehicles, stationary objects, or rollovers',
        true,
      ],
      [
        'Collision',
        Severity.MAJOR,
        'Low-speed impact with parked vehicle, bollard, loading dock wall, or gate',
        false,
      ],
      [
        'Driver Injury',
        Severity.CRITICAL,
        'Workplace health and safety incident resulting in driver injury, strain, or fall',
        false,
      ],
      [
        'Customer Incident',
        Severity.MODERATE,
        'Verbal dispute, aggressive customer behavior, delivery refusal, or access hazard',
        false,
      ],
      [
        'Vehicle Breakdown',
        Severity.MAJOR,
        'Engine failure, flat tyre, electrical shutdown, or roadside immobilization',
        false,
      ],
      [
        'Delivery Incident',
        Severity.MODERATE,
        'Damaged consignment, cold-chain temperature excursion, lost package, or spill',
        false,
      ],
      [
        'Property Damage',
        Severity.MAJOR,
        'Damage to client driveway, gate, awning, fence, or private infrastructure',
        false,
      ],
      [
        'Safety Incident',
        Severity.MAJOR,
        'Near-miss event, dangerous goods spill, fuel leak, or hazardous dock condition',
        false,
      ],
      [
        'Late Delivery',
        Severity.MINOR,
        'Delivery running behind the scheduled window',
        false,
      ],
    ].map(([name, defaultSeverity, description, police]) => ({
      businessId: biz.id,
      name: name as string,
      defaultSeverity: defaultSeverity as Severity,
      description: description as string,
      requiresPoliceReport: police as boolean,
      requiresSupervisorReview: defaultSeverity === Severity.CRITICAL,
    })),
  });

  // ── Today's roster ──
  const shiftJohn = await prisma.shift.create({
    data: {
      businessId: biz.id,
      depotId: sydney.id,
      date: today,
      type: ShiftType.MORNING,
      startTime: '08:00',
      endTime: '17:00',
      breakStart: '13:00',
      breakEnd: '13:30',
      driverId: john.id,
      assistantId: apurba.id,
      vehicleId: hiace.id,
      status: ShiftStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });
  await prisma.shift.create({
    data: {
      businessId: biz.id,
      depotId: sydney.id,
      date: today,
      type: ShiftType.MORNING,
      startTime: '09:00',
      endTime: '18:00',
      breakStart: '12:00',
      breakEnd: '12:30',
      driverId: sarahW.id,
      vehicleId: transit.id,
      status: ShiftStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });
  await prisma.shift.create({
    data: {
      businessId: biz.id,
      depotId: melbourne.id,
      date: days(1),
      type: ShiftType.MORNING,
      startTime: '10:00',
      endTime: '18:00',
      driverId: emma.id,
      vehicleId: isuzu.id,
      status: ShiftStatus.DRAFT,
    },
  });

  // ── Today's deliveries for John ──
  const stops = [
    ['Sarah Chan', '14 Park Rd, Strathfield NSW 2135', 9],
    ['Mike Torres', '88 King St, Newtown NSW 2042', 10],
    ['Liam Johnson', '5 Maple Ave, Burwood NSW 2134', 11],
    ['Emily Zhang', '77 Queen St, Surry Hills NSW 2010', 12],
    ['Noah Brown', '22 Elm St, Bondi NSW 2026', 14],
    ['Ava Kim', '3 Birch Blvd, Chatswood NSW 2067', 15],
  ] as const;
  let order = 1;
  for (const [customerName, deliveryAddress, hour] of stops) {
    await prisma.delivery.create({
      data: {
        businessId: biz.id,
        code: await code(biz.id, 'DEL'),
        customerName,
        contactPerson: customerName,
        contactPhone: '+61 412 345 678',
        pickupAddress: '2 Depot Lane, Parramatta NSW 2150',
        deliveryAddress,
        zone: 'Sydney CBD Core',
        depotId: sydney.id,
        loadingBay: 'Bay 3 - Dock B',
        windowStart: at(hour),
        windowEnd: at(hour + 1),
        scheduledDropTime: at(hour, 30),
        priority: hour < 11 ? Priority.HIGH : Priority.MEDIUM,
        status: order === 3 ? DeliveryStatus.COMPLETED : DeliveryStatus.PENDING,
        deliveredAt: order === 3 ? at(hour, 20) : undefined,
        driverId: john.id,
        vehicleId: hiace.id,
        shiftId: shiftJohn.id,
        createdById: supervisor.id,
        packageCount: 3,
        totalWeightKg: 18,
        fragile: order === 1,
        specialInstructions:
          order === 1
            ? 'Leave at front door if no answer. Do not leave in rain. Call customer first.'
            : null,
        sortOrder: order++,
        packages: {
          create: [
            {
              code: 'PKG-01',
              description: 'Network Switch & Fiber Transceiver Hub',
              weightKg: 8.2,
            },
            { code: 'PKG-02', description: 'Cable kit', weightKg: 4.1 },
            { code: 'PKG-03', description: 'Rack accessories', weightKg: 5.7 },
          ],
        },
      },
    });
  }

  // ── Fleet history ──
  await prisma.inspection.create({
    data: {
      vehicleId: sprinter.id,
      driverId: sarahW.id,
      type: InspectionType.PRE_SHIFT,
      result: InspectionResult.FAILED,
      status: 'ISSUES_REPORTED',
      comments: 'Small scratch found on rear bumper',
      submittedAt: days(-1),
      items: {
        create: [
          { name: 'Tyres', result: ChecklistResult.GOOD },
          { name: 'Lights', result: ChecklistResult.GOOD },
          {
            name: 'Exterior Damage',
            result: ChecklistResult.ISSUE,
            note: 'Scratch on rear bumper',
          },
        ],
      },
    },
  });
  const damage = await prisma.damageReport.create({
    data: {
      code: await code(biz.id, 'DR', 2000),
      vehicleId: sprinter.id,
      reportedById: sarahW.id,
      locations: [DamageLocation.REAR],
      severity: Severity.MINOR,
      description: 'Small scratch found on rear bumper',
      status: DamageReportStatus.REPAIR_REQUESTED,
      noticedAt: days(-1),
    },
  });
  await prisma.repairRequest.create({
    data: {
      code: await code(biz.id, 'REP'),
      vehicleId: sprinter.id,
      damageReportId: damage.id,
      reportedById: sarahW.id,
      issue: 'Rear bumper scratch',
      priority: Priority.LOW,
      status: RepairStatus.PENDING_REVIEW,
      provider: 'Sydney Fleet Service Centre',
      estimatedParts: 400,
      estimatedLabour: 250,
    },
  });
  await prisma.maintenance.create({
    data: {
      vehicleId: isuzu.id,
      depotId: melbourne.id,
      type: MaintenanceType.BRAKE_INSPECTION,
      priority: Priority.HIGH,
      description: 'Replace front brake pads and inspect brake system.',
      scheduledDate: days(3),
      startTime: '09:00',
      expectedCompletion: '14:00',
      locationType: 'EXTERNAL_SERVICE_CENTRE',
      providerName: 'Sydney Fleet Service Centre',
      providerPhone: '+61 298 765 342',
      estimatedParts: 400,
      estimatedLabour: 250,
      estimatedDowntimeHours: 5,
      tasks: {
        create: [
          { title: 'Brake Pad Replacement' },
          { title: 'Brake Inspection' },
          { title: 'Road Test' },
        ],
      },
    },
  });
  await prisma.maintenance.create({
    data: {
      vehicleId: sprinter.id,
      depotId: sydney.id,
      type: MaintenanceType.OIL_CHANGE,
      priority: Priority.MEDIUM,
      scheduledDate: days(7),
      startTime: '08:00',
      expectedCompletion: '10:00',
      locationType: 'DEPOT',
    },
  });

  // ── Notifications & messages ──
  await prisma.notification.createMany({
    data: [
      {
        userId: john.id,
        type: NotificationType.INSPECTION,
        title: 'Complete Pre-Shift Inspection',
        body: 'Complete your pre-shift vehicle inspection before 08:00 AM.',
      },
      {
        userId: john.id,
        type: NotificationType.SHIFT,
        title: 'Shift Starting Soon',
        body: 'Your shift starts in 30 minutes. Please head to the depot.',
      },
    ],
  });
  await prisma.message.createMany({
    data: [
      {
        senderId: john.id,
        recipientId: supervisor.id,
        body: 'Arrived at 25 George St. unloading packages at loading dock now',
      },
      {
        senderId: supervisor.id,
        recipientId: john.id,
        body: 'Great, thanks John. Please send a photo when delivered.',
      },
    ],
  });
  await prisma.auditLog.create({
    data: {
      businessId: biz.id,
      actorId: admin.id,
      action: 'Business Seeded',
      module: 'System',
      details: 'Demo data created',
    },
  });

  console.log(
    'Seed complete. Demo logins (password = SEED_PASSWORD, default Password123):',
  );
  console.table([
    { role: 'SUPER_ADMIN', login: 'superadmin@andyesqo.test' },
    { role: 'BUSINESS_ADMIN', login: 'admin@nanda.test' },
    { role: 'SUPERVISOR', login: 'supervisor@nanda.test' },
    { role: 'FLEET_MANAGER', login: 'fleet@nanda.test' },
    { role: 'ROSTER_MANAGER', login: 'roster@nanda.test' },
    { role: 'DRIVER', login: 'driver@nanda.test or DRV-10024' },
    { role: 'ASSISTANT', login: 'assistant@nanda.test or AST-001' },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

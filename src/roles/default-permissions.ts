import { PermissionModule, UserRole } from '../generated/prisma/enums.js';

type Access = 'none' | 'view' | 'edit';
const M = PermissionModule;

/** Module list with the purpose text from the "Role base permission" screen. */
export const PERMISSION_MODULES: {
  module: PermissionModule;
  name: string;
  purpose: string;
}[] = [
  {
    module: M.DASHBOARD,
    name: 'Dashboard Overview',
    purpose: 'High-level business telemetry, daily revenue & metrics',
  },
  {
    module: M.DELIVERIES,
    name: 'Deliveries Management',
    purpose: 'Create, dispatch, assign drivers & live ETAs',
  },
  {
    module: M.DRIVERS,
    name: 'Driver Directory & Telemetry',
    purpose: 'Driver profiles, performance stats & history',
  },
  {
    module: M.LIVE_MAP,
    name: 'Live GPS Fleet Map',
    purpose: 'Real-time vehicle map, polyline routing & tracking',
  },
  {
    module: M.VEHICLES,
    name: 'Vehicles & Fleet Registry',
    purpose: 'Vehicle assignment, specs & odometer logs',
  },
  {
    module: M.INSPECTIONS,
    name: 'Pre/Post-Trip Inspections',
    purpose: 'Defect logging, damage photos & safety checks',
  },
  {
    module: M.REPAIRS,
    name: 'Repair Work Orders',
    purpose: 'Accident damage tickets & garage work orders',
  },
  {
    module: M.MAINTENANCE,
    name: 'Scheduled Maintenance',
    purpose: 'Odometer trigger intervals & service records',
  },
  {
    module: M.ROSTER,
    name: 'Weekly Roster & Shifts',
    purpose: 'Driver shift scheduling & availability matrix',
  },
  {
    module: M.COMPLIANCE,
    name: 'Compliance & Documents',
    purpose: 'Licences, BFM training, medical certificate',
  },
  {
    module: M.REPORTS,
    name: 'Reports & Analytics',
    purpose: 'SLA on-time delivery rates & exportable reports',
  },
  {
    module: M.COMMUNICATION,
    name: 'Driver Communication',
    purpose: 'In-app driver broadcast alerts & messaging',
  },
  {
    module: M.DEPOTS,
    name: 'Depot Management',
    purpose: 'Multi-depot facility configurations & zones',
  },
  {
    module: M.SETTINGS,
    name: 'Business Settings',
    purpose: 'Operational rules, SLA timers & business profile',
  },
  {
    module: M.AUDIT,
    name: 'Governance Audit Logs',
    purpose: 'Full immutable record of all system modifications',
  },
];

const all = (a: Access) =>
  Object.fromEntries(PERMISSION_MODULES.map((m) => [m.module, a])) as Record<
    PermissionModule,
    Access
  >;

/** Sensible defaults per built-in role (editable later in the matrix). */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  string,
  { name: string; access: Record<PermissionModule, Access> }
> = {
  [UserRole.BUSINESS_ADMIN]: { name: 'Admin', access: all('edit') },
  [UserRole.SUPERVISOR]: {
    name: 'Supervisor',
    access: {
      ...all('view'),
      DELIVERIES: 'edit',
      DRIVERS: 'edit',
      INSPECTIONS: 'edit',
      COMMUNICATION: 'edit',
      SETTINGS: 'none',
      AUDIT: 'none',
      DEPOTS: 'none',
    },
  },
  [UserRole.FLEET_MANAGER]: {
    name: 'Fleet Manager',
    access: {
      ...all('none'),
      DASHBOARD: 'view',
      VEHICLES: 'edit',
      INSPECTIONS: 'edit',
      REPAIRS: 'edit',
      MAINTENANCE: 'edit',
      LIVE_MAP: 'view',
      COMMUNICATION: 'edit',
      REPORTS: 'view',
    },
  },
  [UserRole.ROSTER_MANAGER]: {
    name: 'Roster Manager',
    access: {
      ...all('none'),
      DASHBOARD: 'view',
      ROSTER: 'edit',
      COMPLIANCE: 'edit',
      DRIVERS: 'view',
      VEHICLES: 'view',
      COMMUNICATION: 'edit',
    },
  },
  [UserRole.DRIVER]: {
    name: 'Driver',
    access: {
      ...all('none'),
      DELIVERIES: 'edit',
      VEHICLES: 'view',
      INSPECTIONS: 'edit',
      COMMUNICATION: 'edit',
    },
  },
  [UserRole.ASSISTANT]: {
    name: 'Assistant',
    access: {
      ...all('none'),
      DELIVERIES: 'edit',
      VEHICLES: 'view',
      INSPECTIONS: 'edit',
      COMMUNICATION: 'edit',
    },
  },
};

export function defaultPermissionRows(role: string) {
  const def = DEFAULT_ROLE_PERMISSIONS[role];
  return PERMISSION_MODULES.map(({ module }) => {
    const a = def?.access[module] ?? 'none';
    return { module, canView: a !== 'none', canEdit: a === 'edit' };
  });
}

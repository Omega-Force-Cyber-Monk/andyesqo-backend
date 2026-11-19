import { describe, expect, it } from 'vitest';
import { PermissionModule, UserRole } from '../generated/prisma/enums.js';
import { defaultPermissionRows } from './default-permissions.js';

describe('default field access', () => {
  it.each([UserRole.DRIVER, UserRole.ASSISTANT])(
    'allows %s to view assigned vehicles but not edit them',
    (role) => {
      expect(
        defaultPermissionRows(role).find(
          (row) => row.module === PermissionModule.VEHICLES,
        ),
      ).toMatchObject({ canView: true, canEdit: false });
      expect(
        defaultPermissionRows(role).find(
          (row) => row.module === PermissionModule.DELIVERIES,
        ),
      ).toMatchObject({ canView: true, canEdit: true });
      expect(
        defaultPermissionRows(role).find(
          (row) => row.module === PermissionModule.INSPECTIONS,
        ),
      ).toMatchObject({ canView: true, canEdit: true });
    },
  );
});

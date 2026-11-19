import { INestApplication } from '@nestjs/common';
import { buildOpenApiDocument } from '../src/common/swagger/swagger.js';
import { createTestApp } from './support.js';

describe('OpenAPI contract', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('describes the two login outcomes and public authentication errors', () => {
    const doc = buildOpenApiDocument(app);
    const login = doc.paths['/api/v1/auth/login'].post!;
    expect(login.security).toEqual([]);
    expect(login.responses).toHaveProperty('401');
    expect(login.responses).toHaveProperty('403');
    expect(login.responses).toHaveProperty('429');
    const response = login.responses['200'] as any;
    expect(
      response.content['application/json'].schema.properties.data.oneOf,
    ).toEqual([
      { $ref: '#/components/schemas/TokenPair' },
      { $ref: '#/components/schemas/MfaChallengeResult' },
    ]);
    expect(doc.paths['/api/v1/auth/mfa/verify'].post!.responses).toHaveProperty(
      '401',
    );
    expect(doc.paths['/api/v1/auth/refresh'].post!.responses).toHaveProperty(
      '401',
    );
  });

  it('describes nested array items and unavailable dependencies', () => {
    const doc = buildOpenApiDocument(app);
    const schemas = doc.components!.schemas as Record<string, any>;
    expect(schemas.FuelTotals.properties.entries.items.$ref).toBe(
      '#/components/schemas/FuelLogModel',
    );
    expect(schemas.Peer.properties.assignedVehicles.items.$ref).toBe(
      '#/components/schemas/PeerVehicle',
    );
    expect(
      schemas.PlatformDashboard.properties.businessSetupStatus.items.$ref,
    ).toBe('#/components/schemas/BusinessSetupStatus');
    expect(doc.paths['/health'].get!.responses).toHaveProperty('503');
    expect(
      doc.paths['/api/v1/locations/deliveries/{deliveryId}/route'].get!
        .responses,
    ).toHaveProperty('503');
  });
});

# Andyesqo Backend

REST API for the **Andyesqo** fleet, roster and delivery operations app (Figma: *UI Screens* page).
Built with **NestJS 12**, **Prisma 7** and **PostgreSQL**.

One API serves every app in the design:

| App in Figma | Who uses it | Role in the API |
| --- | --- | --- |
| Driver mobile app | Drivers | `DRIVER` |
| Assistant Driver app | Assistant drivers | `ASSISTANT` |
| Roster Dashboard | Roster managers | `ROSTER_MANAGER` |
| Fleet Dashboard | Fleet managers | `FLEET_MANAGER` |
| Supervisor Dashboard | Supervisors | `SUPERVISOR` |
| Business Admin | Business owner / admin | `BUSINESS_ADMIN` |
| Platform Admin | Andyesqo platform team | `SUPER_ADMIN` |

Every business is a separate tenant. Users only see data from their own business.
The super admin sees everything and can pass `?businessId=` to pick a business.

---

## 1. Requirements

- Node.js 20.19+ (tested on Node 24) and npm
- Docker (for the local database), or any PostgreSQL 15+ server

## 2. Setup

```bash
# 1. install packages
npm install

# 2. create your env file, then set JWT_ACCESS_SECRET and TOTP_ENCRYPTION_KEY to separate long random strings
cp .env.example .env
#    (.env.example also documents AUTH_RATE_LIMIT, TRUST_PROXY, LOCATION_RETENTION_DAYS and mail settings)

# 3. start PostgreSQL (user / password / db = andyesqo)
docker compose up -d

# 4. generate the Prisma client and create the tables
npm run prisma:generate
npm run prisma:migrate

# 5. add demo data (optional but recommended)
npm run db:seed

# 6. run the API in watch mode
npm run dev
```

- API: `http://localhost:3000/api/v1`
- Swagger docs: `http://localhost:3000/docs` (click **Authorize** and paste an access token)
- OpenAPI JSON: `http://localhost:3000/docs-json`. Sign-in returns either a token pair or a five-minute MFA challenge; the Swagger introduction describes enrollment and verification before using the bearer token.
- Health check: `http://localhost:3000/health`

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the API with auto reload |
| `npm run build` | Generate the Prisma client and build to `dist/` |
| `npm run start:prod` | Run the built app (`node dist/main.js`) |
| `npm run prisma:generate` | Generate the Prisma client into `src/generated/prisma` |
| `npm run prisma:migrate` | Create / apply migrations in development (`prisma migrate dev`) |
| `npm run prisma:deploy` | Apply migrations in production (`prisma migrate deploy`) |
| `npm run prisma:studio` | Open Prisma Studio to browse the data |
| `npm run db:seed` | Add demo data |
| `npm run db:reset` | Drop the DB, re-run migrations and seed |
| `npm run lint` | oxlint |
| `npm run openapi:check` | After `npm run build`: validate operation metadata, request bodies and status codes against Nest routes, nested schemas and references; writes `dist/openapi.json` (needs `DATABASE_URL`) |
| `python3 scripts/generate-swagger-models.py .` | Regenerate the Swagger entity models after changing `schema.prisma` |
| `npm run typecheck` | Check TypeScript without emitting files |
| `npm test` / `npm run test:e2e` | Unit tests / e2e tests (e2e needs the database) |

### Demo logins (after `npm run db:seed`)

All passwords are `Password123` (change with `SEED_PASSWORD` in `.env`).

| Role | Login (email or Employee ID) |
| --- | --- |
| Super admin | `superadmin@andyesqo.test` |
| Business admin | `admin@nanda.test` |
| Supervisor | `supervisor@nanda.test` |
| Fleet manager | `fleet@nanda.test` |
| Roster manager | `roster@nanda.test` |
| Driver | `driver@nanda.test` or `DRV-10024` |
| Assistant | `assistant@nanda.test` or `AST-001` |

---

## 3. How the API works

### Auth

1. `POST /api/v1/auth/login` with `{ "identifier": "<email or employee ID>", "password": "...", "rememberMe": true }`
2. If 2FA is not required or enrolled, you get `accessToken` (JWT, 15 min) and `refreshToken` (7 days, 30 days with *Remember me*). Otherwise the response contains `mfaRequired`, `enrollmentRequired`, and a five-minute `challenge`, with no access or refresh token.
3. Send `Authorization: Bearer <accessToken>` on every request.
4. When the access token expires, call `POST /auth/refresh` with the refresh token. The old refresh token stops working (rotation).

Passwords are hashed with bcrypt. Refresh tokens are stored only as SHA-256 hashes.
Routes are protected by default. Each route lists the roles that can use it, and most are also governed by the permission matrix (see section 7).

Authentication endpoints are rate limited per client IP and endpoint (`AUTH_RATE_LIMIT`, default 10 per minute; HTTP 429). Set `TRUST_PROXY` (for example `1`) behind a load balancer so the real client IP is used.

`GET /auth/sessions` lists active sessions (IP address, browser, last authenticated, `current`). `DELETE /auth/sessions/{id}` signs out one session (its access token lapses within 15 minutes); `DELETE /auth/sessions` signs out everywhere immediately. Users of an archived (INACTIVE) business cannot sign in, refresh or use existing tokens.

For a first required enrollment, send the challenge to `POST /auth/mfa/enroll`, present the returned `uri` as a QR code or its `secret` for manual entry, then send `{ "challenge": "...", "code": "123456" }` to `POST /auth/mfa/verify`. Later logins send the login challenge and a fresh code directly to `/auth/mfa/verify`. Signed-in users can start optional enrollment with `POST /auth/mfa/setup` and their current password, then confirm using `/auth/mfa/verify`. Confirmation returns a new token pair. A 2FA-authenticated session can request one-time backup codes via `POST /auth/mfa/recovery-codes`; this replaces any previous codes. Store them securely: they are shown once and can be supplied as `recoveryCode` instead of `code` during login. Existing password-only access and refresh tokens cannot be used while 2FA is required or an authenticator is enrolled. The TOTP key must remain stable across deployments; changing or losing it invalidates enrolled authenticators.

To replace an authenticator, use a 2FA-authenticated session to call `POST /auth/mfa/replace` with the password and a fresh `code` or `recoveryCode`. Enroll the returned secret and call `POST /auth/mfa/replace/confirm` with a code from the new app. The previous authenticator remains active until confirmation, which invalidates existing sessions and returns a new token pair.

An administrator can reset a lost authenticator with `POST /users/{id}/mfa/reset` and `{ "reason": "..." }`. This removes the authenticator and recovery codes, signs the user out everywhere and emails them. Business admins can reset users in their business and depot scope; only the super admin can reset an administrator; nobody can reset their own (use replacement). Enrollment or verification already in progress when a reset lands cannot complete.

The MFA migration invalidates access tokens issued before this version; clients must sign in again. Password changes and resets invalidate existing access tokens, refresh tokens and pending MFA challenges. Initial enrollment is authorized by the account password, so protect first-use credentials and the enrollment URI.

### Response format

Success:

```json
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```

Error:

```json
{ "success": false, "statusCode": 400, "error": "Bad Request", "message": ["email must be an email"], "path": "/api/v1/users", "timestamp": "..." }
```

List endpoints accept `?page=1&limit=20&search=...` and their own filters (see Swagger).
CSV export endpoints return a plain `text/csv` file.

### Uploads

`POST /api/v1/uploads` (multipart, field `files`, up to 10 files of 10 MB each) accepts JPEG, PNG, WebP, HEIC/HEIF and PDF. The type is detected from the file contents; the client's MIME type and filename are not trusted. It returns `{ id, url }` items. Send those URLs (`/api/v1/uploads/{id}`) in `photos`, `receiptPhotos`, `fileUrl`, `avatarUrl` and similar fields; other URLs are rejected.

Files are private. `GET /uploads/{id}` downloads with the bearer token: same business only, and drivers and assistants only their own uploads. For `<img src>`, call `GET /uploads/{id}/link` to get a 15-minute signed URL that needs no token.

---

## 4. Screen → endpoint map

All paths below start with `/api/v1`.

### Authentication (driver app + web)

| Screen | Endpoint |
| --- | --- |
| Login (Employee ID / email + password, Remember me) | `POST /auth/login` |
| Forgot password | `POST /auth/forgot-password` |
| Email verification / New password | `POST /auth/reset-password` |
| Activate account (invite link: name, password, terms) | `POST /auth/activate` |
| Change password (settings) | `PATCH /auth/change-password` |
| Log out | `POST /auth/logout` |
| Current user | `GET /auth/me` |

### Driver app

| Screen | Endpoint |
| --- | --- |
| Home: today's shift, vehicle, assistant, tasks | `GET /roster/me/today` |
| Home: upcoming deliveries | `GET /deliveries/me/today` |
| Profile (performance, personal, employment, credentials, vehicle, documents) | `GET /users/me/profile`, `PATCH /users/me` |
| Pre-shift inspection (12 items) / Post-shift check (10 items) | `GET /inspections/checklist/{PRE_SHIFT or POST_SHIFT}`, `POST /inspections` |
| Inspection passed / failed | result of `POST /inspections`, `GET /inspections/mine` |
| View vehicle | `GET /vehicles/{id}` |
| Report vehicle damage / damage submitted | `POST /damage-reports`, `GET /damage-reports/mine` |
| Clock in | `POST /attendance/clock-in` (needs a passed pre-shift inspection) |
| Deliveries list / delivery details | `GET /deliveries/me`, `GET /deliveries/{id}` |
| Navigation: start, ETA, report delay | `POST /deliveries/{id}/start`, `PATCH /deliveries/{id}/eta`, `POST /deliveries/{id}/delay` |
| Pickup confirmation (photos, barcode) | `POST /deliveries/{id}/pickup` |
| Delivery confirmation (photos, notes) | `POST /deliveries/{id}/complete` |
| Incident report | `GET /incident-types`, `POST /incidents`, `GET /incidents/mine` |
| End shift steps | `GET /attendance/end-shift-summary` |
| Fuel / EV receipt | `POST /fuel-logs` |
| Shift summary / shift complete | `POST /attendance/clock-out` (needs fuel log + post-shift check) |
| Alerts (incl. scheduled "Shift Starting Soon" and "Complete Pre-Shift Inspection") | `GET /notifications`, `PATCH /notifications/{id}/read`, `PATCH /notifications/read-all` |
| Live location while clocked in | `POST /locations/me`, `POST /locations/me/batch` |
| Navigation route | `GET /locations/deliveries/{id}/route` |
| Messages | `GET /messages/conversations`, `GET /messages/contacts`, `GET /messages/with/{userId}`, `POST /messages` |

### Assistant driver app

| Screen | Endpoint |
| --- | --- |
| Home with paired driver, shift details | `GET /roster/me/today` |
| Clock in / out | `POST /attendance/clock-in`, `POST /attendance/clock-out` |
| View vehicle | `GET /vehicles/{id}` |
| Messages | same as driver |

### Roster dashboard

| Screen | Endpoint |
| --- | --- |
| Home | `GET /dashboard/roster` |
| Roster table, edit shift, delete shift | `GET /roster`, `GET /roster/{id}`, `PATCH /roster/{id}`, `DELETE /roster/{id}` |
| Create roster (3 steps: date and shift, crew, review) | `GET /availability`, `GET /vehicles?status=AVAILABLE`, `POST /roster`, `POST /roster/publish` |
| Upcoming shifts | `GET /roster/upcoming` |
| Driver / assistant availability | `GET /availability?role=DRIVER or ASSISTANT`, `PUT /availability` |
| Compliance (licence, visa, medical, police, training, fatigue) | `GET /compliance`, `GET /compliance/alerts`, `GET /compliance/{userId}`, `GET /compliance/export` |
| Compliance documents | `GET/POST /compliance/{userId}/documents`, `PATCH/DELETE /compliance/documents/{docId}` |
| Vehicles, driver / vehicle drawers | `GET /vehicles`, `GET /vehicles/{id}`, `GET /drivers/{id}/overview` |

### Fleet dashboard

| Screen | Endpoint |
| --- | --- |
| Home | `GET /dashboard/fleet`, `GET /vehicles/attention` |
| Vehicles list, stats, details | `GET /vehicles`, `GET /vehicles/stats`, `GET /vehicles/{id}`, `GET /vehicles/{id}/status-history` |
| Add / edit vehicle | `POST /vehicles`, `PATCH /vehicles/{id}` |
| Assign driver | `PATCH /vehicles/{id}/assign-driver` |
| Update status (incl. grounded) | `PATCH /vehicles/{id}/status` |
| Inspections, review | `GET /inspections`, `GET /inspections/overview/today`, `PATCH /inspections/{id}/review`, `POST /inspections/{id}/ground-vehicle` |
| Damage reports, view details (assessment, estimates) | `GET /damage-reports`, `GET /damage-reports/stats`, `PATCH /damage-reports/{id}/assessment`, `POST /damage-reports/{id}/approve`, `POST /damage-reports/{id}/ground-vehicle` |
| Repair requests | `POST /damage-reports/{id}/repair-request`, `GET/POST /repair-requests`, `PATCH /repair-requests/{id}/status` |
| Schedule maintenance (wizard) | `GET /maintenance/availability-check`, `POST /maintenance`, tasks under `/maintenance/{id}/tasks` |
| Scheduled servicing | `GET /maintenance`, `GET /maintenance/upcoming`, `PATCH /maintenance/{id}/status` |
| Messages | `/messages/*` |

### Supervisor dashboard

| Screen | Endpoint |
| --- | --- |
| Home | `GET /dashboard/supervisor` |
| Deliveries, create new delivery, delivery details | `GET /deliveries`, `GET /deliveries/stats`, `POST /deliveries`, `GET/PATCH /deliveries/{id}` |
| Drivers, active driver roster, driver details | `GET /drivers/live`, `GET /drivers/{id}/overview`, `GET /deliveries/driver/{driverId}/history` |
| Inspections, "Send driver reminders" | `GET /inspections`, `GET /inspections/overview/today`, `POST /inspections/reminders` |
| Live delivery tracking (position, speed, path) | `GET /locations/deliveries/{id}/track`, `GET /locations/latest` |
| Incidents | `GET /incidents`, `PATCH /incidents/{id}/status` |
| Reports | `GET /reports/operations` |
| Messages / notifications | `/messages/*`, `/notifications/*` |

### Business admin

| Screen | Endpoint |
| --- | --- |
| Home | `GET /dashboard/business-admin` |
| All users, create / edit user, resend invite | `GET /users`, `GET /users/stats`, `GET /users/export`, `POST /users`, `PATCH /users/{id}`, `DELETE /users/{id}`, `POST /users/{id}/resend-invitation` |
| Depot scope, permission overrides, authenticator reset | `GET /users/{id}/access`, `PUT /users/{id}/access/depots`, `PUT /users/{id}/access/overrides`, `DELETE /users/{id}/access/overrides/{module}`, `POST /users/{id}/mfa/reset` |
| Live GPS Fleet Map | `GET /locations/latest`, `GET /locations/drivers/{id}/history` |
| Role permission matrix | `GET /roles`, `POST /roles`, `PUT /roles/permissions`, `DELETE /roles/{id}` |
| Deliveries, vehicles registry, inspection defects, damage reports, repair requests, scheduled servicing, roster, compliance | same endpoints as the dashboards above |
| Damage types config | `GET/POST /damage-types`, `PATCH/DELETE /damage-types/{id}` |
| Incident types config | `GET/POST /incident-types`, `PATCH/DELETE /incident-types/{id}` |
| Depots | `GET/POST /depots`, `PATCH/DELETE /depots/{id}` |
| Settings (company info, 2FA toggle, time zone), change password | `GET /settings`, `PATCH /settings`, `PATCH /auth/change-password` |
| Audit log | `GET /audit-logs`, `GET /audit-logs/export` |

### Platform admin (super admin)

| Screen | Endpoint |
| --- | --- |
| Home | `GET /dashboard/platform` |
| Business list, create business (3 steps), business profile and setup checklist | `GET /businesses`, `GET /businesses/stats`, `POST /businesses`, `GET/PATCH/DELETE /businesses/{id}` |
| Administrators, create / manage administrator | `GET /administrators`, `GET /administrators/stats`, `POST /administrators`, `GET/PATCH /administrators/{id}`, `POST /administrators/{id}/resend-invitation` |
| Regions, assign region | `GET/POST /regions`, `PATCH/DELETE /regions/{id}`, `GET/PUT /regions/assignments`, `PATCH /regions/assignments/{id}` |
| Role matrix (platform templates), create role | `/roles` (without a business) |
| Activity | `GET /audit-logs` |
| Profile & security (active sessions, 2FA, password) | `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `POST /auth/mfa/setup`, `PATCH /auth/change-password` |

---

## 5. Data model (Prisma)

Main tables: `Region`, `Business`, `BusinessRegion`, `Depot`, `User`, `RefreshToken`, `UserToken`,
`RoleDefinition` + `RolePermission`, `ComplianceDocument`, `Availability`, `Vehicle`, `VehicleStatusLog`,
`Inspection` + `InspectionItem`, `DamageType`, `DamageReport`, `RepairRequest`, `Maintenance` + `MaintenanceTask`,
`Shift`, `Attendance`, `FuelLog`, `Delivery` + `Package`, `IncidentType`, `IncidentReport`,
`Message`, `Notification`, `AuditLog`, `Upload`, `DriverLocation`, MFA tables, `UserDepotScope`, `UserPermissionOverride`, `Counter` (makes readable IDs like `DEL-1001`, `REP-1001`, `DR-2001`, `VH-1001`, `DRV-1001`).
Queued email lives in the `nest_outbox` schema (created by a Prisma migration).

See `prisma/schema.prisma` for every field and enum.

## 6. Project structure

```
prisma/            schema.prisma, migrations/, seed.ts
prisma.config.ts   Prisma 7 config (DB URL, seed command)
src/
  main.ts          bootstrap: /api/v1 prefix, CORS, ValidationPipe, Swagger, error filter
  config/          env validation
  prisma/          PrismaService (global)
  common/          guards, decorators, response interceptor, error filter, helpers
  auth/ users/ roles/ businesses/ administrators/ regions/ depots/ settings/
  vehicles/ inspections/ damage-reports/ repair-requests/ maintenance/ catalog/
  roster/ compliance/ attendance/ deliveries/ incidents/
  messages/ notifications/ uploads/ audit-logs/ dashboard/ health/
  locations/       GPS ingest, live map, tracking, retention job, routing provider
  alerts/          scheduled compliance and platform alerts
  common/swagger/  OpenAPI helpers and response models
scripts/           OpenAPI check, Swagger model generator
  generated/prisma Prisma client (generated, not in git)
```

---

## 7. Assumptions and defaults

The Figma file has no written brief, so these choices were made. Change them as needed.

1. **Login:** driver and assistant apps log in with Employee ID, web dashboards with email. The API accepts either.
2. **Email:** set `SMTP_URL` and `MAIL_FROM` for production; startup fails if either is missing. Without SMTP in development, messages are written to `MAIL_DIRECTORY` (default `var/mail`); treat those files as secrets. Invitation and reset tokens are also returned as `devToken` outside production. Email is queued in a PostgreSQL transactional outbox (`@nestjs/outbox`) together with the token it carries, then delivered in the background with 12 attempts and exponential backoff up to an hour. Failures go to a dead-letter table kept for 14 days. An SMTP outage does not fail requests.
3. **2FA:** business-required 2FA uses authenticator-app TOTP. A user without an authenticator enrolls after password verification. Secrets are encrypted at rest and OTP attempts and replay protection are stored in PostgreSQL. Administrators can reset a lost authenticator (see Auth).
4. **Driver GPS:** `POST /locations/me` (or `/locations/me/batch` for up to 100 buffered points) records a driver's coordinates while they are clocked in; points must fall between clock-in and now. Points older than `LOCATION_RETENTION_DAYS` (default 90) are purged daily. `GET /locations/latest` provides the latest point per driver, and `GET /locations/drivers/{driverId}/history?from=...&to=...` returns up to 24 hours of points with a `nextCursor` for pagination. Super admins must provide `businessId`. An assigned driver can request `GET /locations/deliveries/{deliveryId}/route` using a location no older than 15 minutes. `GET /locations/latest` adds `stale` (older than 15 minutes), today's vehicle and the active delivery with an on-time flag. `GET /locations/deliveries/{id}/track` returns the driver's latest point, speed derived from the last two points, and the path since the delivery started. Implement `RoutingProvider` and bind it in `LocationsModule` to select a routing vendor; the default responds 503 because the owner will choose the vendor later. There is no push transport; clients poll.
5. **Uploads** are stored privately on local disk (`UPLOAD_DIR`, mode 0600) and served only through the authenticated API or signed links. Use a shared volume, or replace the storage in `UploadsService` with object storage, when running several instances.
6. **Compliance rules:** a document expiring within 30 days is "expiring". Medical certificate and police check are required. Fatigue limits are 8 hours a day and 40 hours a week. All in `src/compliance/compliance.rules.ts`.
7. **Late deliveries:** a delivery is late 15 minutes after its ETA, else window end, else scheduled drop time (`src/deliveries/delivery.rules.ts`).
8. **Shift rules:** drivers need a passed pre-shift inspection to clock in, and a fuel/EV receipt (or "did not refuel") plus a post-shift check to clock out.
9. **Inspections and damage:** a failed inspection sets the vehicle to `INSPECTION_REQUIRED`. Critical issues or damage types marked "auto ground" set it to `GROUNDED`.
10. **Roles:** built-in role restrictions still apply across the API. The `LIVE_MAP` View permission is additionally enforced for `GET /locations/latest` and driver location history. The `DRIVERS` permission is enforced for user directory reads and administrative mutations; non-admin managers see only drivers and assistants. `VEHICLES` View/Edit permissions are enforced on vehicle endpoints; field users with View permission can see vehicles assigned to them or used in their published current-day shift, within their depot scope. `DELIVERIES` View/Edit applies to delivery reads and changes, including driver actions; drivers and assistants can access only their own assignments. `INSPECTIONS` View/Edit applies to checklist, submission, review and inspection reads; field users can access only their own inspections. An active user override takes precedence over the built-in role's matrix entry, and a missing entry denies access. Business admins and super admins bypass the module matrix. The matrix now governs every operational module: `REPAIRS`, `MAINTENANCE`, `ROSTER` (roster, availability, timesheets, fuel logs), `COMPLIANCE`, `DELIVERIES` (including incidents), `COMMUNICATION` (messages), `DEPOTS` and `SETTINGS` (changes only; depot and category lists are reference data), `AUDIT`, `DASHBOARD` (dashboard sections are hidden without their module), `REPORTS`, and `DRIVERS` (live drivers, driver overview). On matrix-governed routes, dashboard roles (business admin, supervisor, fleet manager, roster manager) are decided by the matrix and overrides, so a granted permission opens the route even if the role is not its usual user. Drivers and assistants must still be listed on the route and see only their own records. User access management, the business-admin and platform dashboards, businesses, regions and roles stay role-restricted. Managers who are not administrators can only manage driver and assistant accounts, and only administrators can change the 2FA policy.
11. **Business setup checklist:** the six visible steps are business created, administrator assigned, regions assigned, platform settings configured, permissions verified, and business ready. An invited administrator counts as assigned; inactive administrators do not. The design's heading says seven steps, but six are shown, and the owner approved using the six visible steps.
12. **Attendance rate** on the driver profile is the share of the last 30 days' published shifts the user clocked in to. **Safety score** returns `null` because the design gives no rule for it.
13. **Regions** are Australian states (NSW, VIC, QLD, ...), as shown in the design.
14. **bcryptjs** (pure JS bcrypt) is used, so no native build step is needed.
15. **Messages** are plain REST (no WebSocket). The app can poll `GET /messages/conversations`.
16. **Time zone:** each business has a `timezone` (IANA, default `Australia/Sydney`, set with `PATCH /settings`). "Today", local date ranges and shift reminders use it, because Australian mornings fall on the previous UTC day.
17. **Scheduled jobs** (`@nestjs/schedule`, run in every instance; each job is idempotent or locked):
    - Shift reminders every 5 minutes.
    - Compliance alerts daily at 20:00 UTC: "Driver Compliance Expiry Notice" and "Driver Stand-down" to roster managers and admins, repeated weekly while unresolved.
    - Platform alerts daily at 21:00 UTC: "Business Setup Incomplete" after 3 days and "Administrator Invitation Pending" once the invitation expires.
    - Hourly setup-status reconciliation.
    - GPS and outbox retention daily.
18. **Business status:** PENDING_SETUP, INCOMPLETE and READY are derived from the checklist. ACTIVE (go-live) can be set only when the first five steps are complete. INACTIVE archives the business and blocks its users. Setting a setup status reopens the business and recomputes it. A region assignment switched to INACTIVE does not count toward the regions step.
19. **SMS and vehicle telemetry:** "Send driver SMS reminders" sends in-app notifications, and vehicle fuel level is not available; see `CODEX_QUESTIONS.md`.

### Per-user access controls

Business administrators can inspect `GET /users/{id}/access`, set depot scope with `PUT /users/{id}/access/depots` (`{ "allDepots": false, "depotIds": ["..."] }`), and set a time-limited permission with `PUT /users/{id}/access/overrides` (`module`, `canView`, `canEdit`, `startsAt`, and `expiresAt`). Delete an override with `DELETE /users/{id}/access/overrides/{module}`. Edit implies view; an active deny overrides the role grant, and an expired override falls back to the role. Empty depot lists deny scoped access; users default to all depots for compatibility. Depot filtering applies to all operational resources (users, vehicles, deliveries, inspections, damage reports, repairs, maintenance, roster, availability, timesheets, compliance, incidents, dashboards, live location and depots).

User details include compliance documents and assigned vehicles only when the caller can view those modules; assigned vehicles are also filtered by depot. A depot-scoped administrator can manage only users and grant only depots within that scope.

New businesses grant drivers and assistants vehicle View access for their assigned or current-shift vehicle, and delivery and inspection Edit access for their own tasks. Existing businesses retain their saved matrix and must grant `VEHICLES` View and `DELIVERIES` and `INSPECTIONS` Edit for those flows if they were previously disabled.

---

## 8. project-guard

[`@amitavrchy/project-guard`](https://www.npmjs.com/package/@amitavrchy/project-guard) is installed. It runs a quick security scan before `npm install`, `build`, `start*` and `dev`, and from the git `pre-commit` / `pre-push` hooks.
`.projectguardignore` allows only the long-line rule (PG008) for the generated Prisma client in `src/generated/prisma/`.
After cloning, run `npx --yes @amitavrchy/project-guard@latest install` again to add the git hooks (hooks are not part of the repo).

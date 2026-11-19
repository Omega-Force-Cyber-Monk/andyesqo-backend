# Open design questions

Questions the Figma design cannot answer. A default was chosen for each so work could continue. Each is also listed in the README assumptions.

## 1. "Send driver SMS reminders" (Supervisor home, Pending Inspections alert)

The design labels the action as an SMS reminder, but no SMS provider or phone verification flow is specified.

**Default:** `POST /inspections/reminders` sends an in-app notification to each of today's rostered drivers who have not submitted the pre-shift inspection, at most once per 30 minutes per shift. An SMS channel can be added behind the same endpoint once a provider is chosen.

## 2. Vehicle telemetry on delivery details ("Current Speed", "Vehicle Fuel 78% Tank")

The design shows live speed and fuel level, but no vehicle telematics or OBD device integration is specified.

**Default:** speed is derived from the driver's two latest GPS points (`latest.speedKmh` on `GET /locations/deliveries/{id}/track`, `null` when unknown). Fuel level is not available; the latest fuel receipt is shown on the driver's shift summary. A telematics provider can be added later.

## 3. Business time zone

Shift times are wall-clock strings (for example "08:00"), and the design shows businesses across several Australian states with different time zones.

**Default:** each business has a `timezone` setting (IANA name, default `Australia/Sydney`, editable with `PATCH /settings`). Shift reminders and business-local date calculations, including today's roster, use that timezone.

CREATE TABLE "DriverLocation" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverLocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DriverLocation_driverId_recordedAt_idx" ON "DriverLocation"("driverId", "recordedAt" DESC);
ALTER TABLE "DriverLocation" ADD CONSTRAINT "DriverLocation_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

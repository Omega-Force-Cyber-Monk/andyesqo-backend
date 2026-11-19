-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney';
-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "inspectionReminderAt" TIMESTAMP(3),
ADD COLUMN     "startReminderAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allDepots" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UserPermissionOverride" (
    "userId" TEXT NOT NULL,
    "module" "PermissionModule" NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("userId","module"),
    CONSTRAINT "UserPermissionOverride_valid_period" CHECK ("startsAt" < "expiresAt"),
    CONSTRAINT "UserPermissionOverride_edit_implies_view" CHECK (NOT "canEdit" OR "canView")
);

-- CreateTable
CREATE TABLE "UserDepotScope" (
    "userId" TEXT NOT NULL,
    "depotId" TEXT NOT NULL,

    CONSTRAINT "UserDepotScope_pkey" PRIMARY KEY ("userId","depotId")
);

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDepotScope" ADD CONSTRAINT "UserDepotScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDepotScope" ADD CONSTRAINT "UserDepotScope_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE CASCADE ON UPDATE CASCADE;


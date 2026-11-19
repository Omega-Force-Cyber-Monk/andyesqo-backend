-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "Upload_storageKey_key" ON "Upload"("storageKey");
-- CreateIndex
CREATE INDEX "Upload_businessId_createdAt_idx" ON "Upload"("businessId", "createdAt");
-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

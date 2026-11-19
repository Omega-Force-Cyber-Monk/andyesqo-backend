-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "mfaVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RefreshToken" ADD COLUMN     "credentialVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MfaTotp" (
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "pendingSecret" TEXT,
    "lastUsedStep" BIGINT,

    CONSTRAINT "MfaTotp_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "MfaRecoveryCode" (
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("userId","hash")
);

-- CreateTable
CREATE TABLE "MfaAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MfaAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "remember" BOOLEAN NOT NULL DEFAULT false,
    "credentialVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MfaAttempt_userId_at_idx" ON "MfaAttempt"("userId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "MfaChallenge_tokenHash_key" ON "MfaChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "MfaChallenge_userId_idx" ON "MfaChallenge"("userId");

-- AddForeignKey
ALTER TABLE "MfaTotp" ADD CONSTRAINT "MfaTotp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaAttempt" ADD CONSTRAINT "MfaAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaChallenge" ADD CONSTRAINT "MfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


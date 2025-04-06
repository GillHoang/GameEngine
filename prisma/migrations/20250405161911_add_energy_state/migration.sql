-- CreateTable
CREATE TABLE "UserEnergyState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "currentEnergy" INTEGER NOT NULL,
    "maxEnergy" INTEGER NOT NULL,
    "lastEnergyUpdate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "regenRateMultiplier" REAL NOT NULL DEFAULT 1.0,
    "regenBoostExpiry" DATETIME,
    "overflowExpiry" DATETIME,
    "currentRecoveryZoneId" TEXT,
    "recoveryZoneEntryTime" DATETIME,
    "passiveMaxEnergyBonus" REAL NOT NULL DEFAULT 0.0,
    "passiveEfficiencyBonus" REAL NOT NULL DEFAULT 0.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserEnergyState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserEnergyState_currentRecoveryZoneId_fkey" FOREIGN KEY ("currentRecoveryZoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserEnergyState_userId_key" ON "UserEnergyState"("userId");

-- CreateIndex
CREATE INDEX "UserEnergyState_overflowExpiry_idx" ON "UserEnergyState"("overflowExpiry");

-- CreateIndex
CREATE INDEX "UserEnergyState_regenBoostExpiry_idx" ON "UserEnergyState"("regenBoostExpiry");

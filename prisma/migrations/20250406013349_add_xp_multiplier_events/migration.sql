-- CreateTable
CREATE TABLE "XpMultiplierEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "multiplier" REAL NOT NULL DEFAULT 1.0,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "userIds" TEXT,
    "zoneIds" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "XpMultiplierEvent_startTime_endTime_idx" ON "XpMultiplierEvent"("startTime", "endTime");

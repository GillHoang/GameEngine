-- CreateTable
CREATE TABLE "GameMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "data" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "GameMetric_userId_idx" ON "GameMetric"("userId");

-- CreateIndex
CREATE INDEX "GameMetric_action_idx" ON "GameMetric"("action");

-- CreateIndex
CREATE INDEX "GameMetric_timestamp_idx" ON "GameMetric"("timestamp");

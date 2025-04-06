-- CreateTable
CREATE TABLE "MilestoneReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "amount" INTEGER,
    "itemId" TEXT,
    "titleId" TEXT,
    "specialId" TEXT,
    "description" TEXT NOT NULL,
    "claimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MilestoneReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MilestoneReward_userId_level_idx" ON "MilestoneReward"("userId", "level");

-- CreateIndex
CREATE INDEX "MilestoneReward_claimed_idx" ON "MilestoneReward"("claimed");

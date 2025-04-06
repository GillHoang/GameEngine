-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "currency" INTEGER NOT NULL DEFAULT 0,
    "currentEnergy" INTEGER NOT NULL DEFAULT 100,
    "maxEnergy" INTEGER NOT NULL DEFAULT 100,
    "currentZoneId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastActive" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prestigeLevel" INTEGER NOT NULL DEFAULT 0,
    "prestigePoints" INTEGER NOT NULL DEFAULT 0,
    "totalLifetimeExperience" INTEGER NOT NULL DEFAULT 0,
    "activeTitle" TEXT,
    "activeBadge" TEXT,
    CONSTRAINT "User_currentZoneId_fkey" FOREIGN KEY ("currentZoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("activeBadge", "activeTitle", "createdAt", "currency", "currentEnergy", "currentZoneId", "discordId", "experience", "id", "level", "maxEnergy", "prestigeLevel", "prestigePoints", "totalLifetimeExperience", "updatedAt", "username") SELECT "activeBadge", "activeTitle", "createdAt", "currency", "currentEnergy", "currentZoneId", "discordId", "experience", "id", "level", "maxEnergy", "prestigeLevel", "prestigePoints", "totalLifetimeExperience", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

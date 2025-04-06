-- CreateTable
CREATE TABLE "PrestigePerk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "effect" TEXT NOT NULL,
    "maxLevel" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserPrestigePerk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "prestigePerkId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPrestigePerk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserPrestigePerk_prestigePerkId_fkey" FOREIGN KEY ("prestigePerkId") REFERENCES "PrestigePerk" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SkillTree" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SkillNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillTreeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "xPosition" INTEGER NOT NULL,
    "yPosition" INTEGER NOT NULL,
    "requiredPoints" INTEGER NOT NULL DEFAULT 1,
    "requiredLevel" INTEGER NOT NULL DEFAULT 1,
    "effect" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillNode_skillTreeId_fkey" FOREIGN KEY ("skillTreeId") REFERENCES "SkillTree" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SkillNodeDependency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentNodeId" TEXT NOT NULL,
    "childNodeId" TEXT NOT NULL,
    CONSTRAINT "SkillNodeDependency_parentNodeId_fkey" FOREIGN KEY ("parentNodeId") REFERENCES "SkillNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SkillNodeDependency_childNodeId_fkey" FOREIGN KEY ("childNodeId") REFERENCES "SkillNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSkillNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "skillNodeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSkillNode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserSkillNode_skillNodeId_fkey" FOREIGN KEY ("skillNodeId") REFERENCES "SkillNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnhancementType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "statType" TEXT NOT NULL,
    "maxLevel" INTEGER NOT NULL DEFAULT 5,
    "baseBonus" REAL NOT NULL,
    "bonusPerLevel" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EnhancementMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enhancementTypeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnhancementMaterial_enhancementTypeId_fkey" FOREIGN KEY ("enhancementTypeId") REFERENCES "EnhancementType" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EnhancementMaterial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserEquipmentEnhancement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userItemInstanceId" TEXT NOT NULL,
    "enhancementTypeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserEquipmentEnhancement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserEquipmentEnhancement_userItemInstanceId_fkey" FOREIGN KEY ("userItemInstanceId") REFERENCES "UserItemInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserEquipmentEnhancement_enhancementTypeId_fkey" FOREIGN KEY ("enhancementTypeId") REFERENCES "EnhancementType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Title" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'COMMON',
    "requirement" TEXT NOT NULL,
    "statBonus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "requirement" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserTitle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "obtainedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserTitle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserTitle_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "obtainedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
    "prestigeLevel" INTEGER NOT NULL DEFAULT 0,
    "prestigePoints" INTEGER NOT NULL DEFAULT 0,
    "totalLifetimeExperience" INTEGER NOT NULL DEFAULT 0,
    "activeTitle" TEXT,
    "activeBadge" TEXT,
    CONSTRAINT "User_currentZoneId_fkey" FOREIGN KEY ("currentZoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "currency", "currentEnergy", "currentZoneId", "discordId", "experience", "id", "level", "maxEnergy", "updatedAt", "username") SELECT "createdAt", "currency", "currentEnergy", "currentZoneId", "discordId", "experience", "id", "level", "maxEnergy", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PrestigePerk_name_key" ON "PrestigePerk"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserPrestigePerk_userId_prestigePerkId_key" ON "UserPrestigePerk"("userId", "prestigePerkId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillTree_name_key" ON "SkillTree"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SkillNode_skillTreeId_name_key" ON "SkillNode"("skillTreeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SkillNodeDependency_parentNodeId_childNodeId_key" ON "SkillNodeDependency"("parentNodeId", "childNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSkillNode_userId_skillNodeId_key" ON "UserSkillNode"("userId", "skillNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "EnhancementType_name_key" ON "EnhancementType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EnhancementMaterial_enhancementTypeId_level_itemId_key" ON "EnhancementMaterial"("enhancementTypeId", "level", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "UserEquipmentEnhancement_userItemInstanceId_key" ON "UserEquipmentEnhancement"("userItemInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "UserEquipmentEnhancement_userItemInstanceId_enhancementTypeId_key" ON "UserEquipmentEnhancement"("userItemInstanceId", "enhancementTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Title_name_key" ON "Title"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_name_key" ON "Badge"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserTitle_userId_titleId_key" ON "UserTitle"("userId", "titleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");

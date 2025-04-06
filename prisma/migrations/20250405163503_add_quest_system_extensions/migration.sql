-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CraftingMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CraftingMaterial_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "CraftingRecipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CraftingMaterial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CraftingMaterial" ("createdAt", "id", "itemId", "quantity", "recipeId", "updatedAt") SELECT "createdAt", "id", "itemId", "quantity", "recipeId", "updatedAt" FROM "CraftingMaterial";
DROP TABLE "CraftingMaterial";
ALTER TABLE "new_CraftingMaterial" RENAME TO "CraftingMaterial";
CREATE TABLE "new_InventorySlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventorySlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventorySlot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_InventorySlot" ("createdAt", "id", "itemId", "quantity", "updatedAt", "userId") SELECT "createdAt", "id", "itemId", "quantity", "updatedAt", "userId" FROM "InventorySlot";
DROP TABLE "InventorySlot";
ALTER TABLE "new_InventorySlot" RENAME TO "InventorySlot";
CREATE UNIQUE INDEX "InventorySlot_userId_itemId_key" ON "InventorySlot"("userId", "itemId");
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "energyCost" INTEGER NOT NULL,
    "xpReward" INTEGER NOT NULL,
    "requiredLevel" INTEGER NOT NULL DEFAULT 1,
    "requiredItemId" TEXT,
    "zoneId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Job_requiredItemId_fkey" FOREIGN KEY ("requiredItemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("createdAt", "description", "energyCost", "id", "name", "requiredItemId", "requiredLevel", "updatedAt", "xpReward", "zoneId") SELECT "createdAt", "description", "energyCost", "id", "name", "requiredItemId", "requiredLevel", "updatedAt", "xpReward", "zoneId" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE UNIQUE INDEX "Job_name_key" ON "Job"("name");
CREATE TABLE "new_JobReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "minAmount" INTEGER NOT NULL,
    "maxAmount" INTEGER NOT NULL,
    "chance" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobReward_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobReward_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_JobReward" ("chance", "createdAt", "id", "itemId", "jobId", "maxAmount", "minAmount", "updatedAt") SELECT "chance", "createdAt", "id", "itemId", "jobId", "maxAmount", "minAmount", "updatedAt" FROM "JobReward";
DROP TABLE "JobReward";
ALTER TABLE "new_JobReward" RENAME TO "JobReward";
CREATE TABLE "new_MarketListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userItemInstanceId" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "buyerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MarketListing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MarketListing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MarketListing_userItemInstanceId_fkey" FOREIGN KEY ("userItemInstanceId") REFERENCES "UserItemInstance" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MarketListing" ("buyerId", "createdAt", "id", "itemId", "price", "quantity", "sellerId", "status", "updatedAt", "userItemInstanceId") SELECT "buyerId", "createdAt", "id", "itemId", "price", "quantity", "sellerId", "status", "updatedAt", "userItemInstanceId" FROM "MarketListing";
DROP TABLE "MarketListing";
ALTER TABLE "new_MarketListing" RENAME TO "MarketListing";
CREATE UNIQUE INDEX "MarketListing_userItemInstanceId_key" ON "MarketListing"("userItemInstanceId");
CREATE TABLE "new_NpcShop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_NpcShop" ("createdAt", "description", "id", "name", "updatedAt") SELECT "createdAt", "description", "id", "name", "updatedAt" FROM "NpcShop";
DROP TABLE "NpcShop";
ALTER TABLE "new_NpcShop" RENAME TO "NpcShop";
CREATE UNIQUE INDEX "NpcShop_name_key" ON "NpcShop"("name");
CREATE TABLE "new_NpcShopItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "buyPrice" INTEGER,
    "sellPrice" INTEGER,
    "stock" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NpcShopItem_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "NpcShop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NpcShopItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_NpcShopItem" ("buyPrice", "createdAt", "id", "itemId", "sellPrice", "shopId", "stock", "updatedAt") SELECT "buyPrice", "createdAt", "id", "itemId", "sellPrice", "shopId", "stock", "updatedAt" FROM "NpcShopItem";
DROP TABLE "NpcShopItem";
ALTER TABLE "new_NpcShopItem" RENAME TO "NpcShopItem";
CREATE TABLE "new_Quest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredLevel" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "questType" TEXT NOT NULL DEFAULT 'STANDARD',
    "expiresAt" DATETIME,
    "chainId" TEXT,
    "chainOrder" INTEGER,
    "zoneId" TEXT,
    "minLevel" INTEGER,
    "maxLevel" INTEGER,
    "previousQuestId" TEXT,
    "nextQuestId" TEXT,
    CONSTRAINT "Quest_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quest_previousQuestId_fkey" FOREIGN KEY ("previousQuestId") REFERENCES "Quest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Quest" ("createdAt", "description", "id", "name", "requiredLevel", "updatedAt") SELECT "createdAt", "description", "id", "name", "requiredLevel", "updatedAt" FROM "Quest";
DROP TABLE "Quest";
ALTER TABLE "new_Quest" RENAME TO "Quest";
CREATE UNIQUE INDEX "Quest_name_key" ON "Quest"("name");
CREATE UNIQUE INDEX "Quest_previousQuestId_key" ON "Quest"("previousQuestId");
CREATE UNIQUE INDEX "Quest_nextQuestId_key" ON "Quest"("nextQuestId");
CREATE TABLE "new_QuestObjective" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetItemId" TEXT,
    "targetJobId" TEXT,
    "targetAmount" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestObjective_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestObjective_targetItemId_fkey" FOREIGN KEY ("targetItemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_QuestObjective" ("createdAt", "description", "id", "questId", "targetAmount", "targetItemId", "targetJobId", "type", "updatedAt") SELECT "createdAt", "description", "id", "questId", "targetAmount", "targetItemId", "targetJobId", "type", "updatedAt" FROM "QuestObjective";
DROP TABLE "QuestObjective";
ALTER TABLE "new_QuestObjective" RENAME TO "QuestObjective";
CREATE TABLE "new_QuestReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questId" TEXT NOT NULL,
    "itemId" TEXT,
    "quantity" INTEGER,
    "currency" INTEGER,
    "experience" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestReward_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestReward_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_QuestReward" ("createdAt", "currency", "experience", "id", "itemId", "quantity", "questId", "updatedAt") SELECT "createdAt", "currency", "experience", "id", "itemId", "quantity", "questId", "updatedAt" FROM "QuestReward";
DROP TABLE "QuestReward";
ALTER TABLE "new_QuestReward" RENAME TO "QuestReward";
CREATE TABLE "new_Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Skill" ("createdAt", "description", "id", "name", "updatedAt") SELECT "createdAt", "description", "id", "name", "updatedAt" FROM "Skill";
DROP TABLE "Skill";
ALTER TABLE "new_Skill" RENAME TO "Skill";
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");
CREATE TABLE "new_ToolSpecification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "efficiencyBonus" REAL NOT NULL DEFAULT 1.0,
    "maxDurability" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolSpecification_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ToolSpecification" ("createdAt", "efficiencyBonus", "id", "itemId", "maxDurability", "updatedAt") SELECT "createdAt", "efficiencyBonus", "id", "itemId", "maxDurability", "updatedAt" FROM "ToolSpecification";
DROP TABLE "ToolSpecification";
ALTER TABLE "new_ToolSpecification" RENAME TO "ToolSpecification";
CREATE UNIQUE INDEX "ToolSpecification_itemId_key" ON "ToolSpecification"("itemId");
CREATE TABLE "new_UserItemInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "durability" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserItemInstance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserItemInstance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserItemInstance" ("createdAt", "durability", "id", "itemId", "updatedAt", "userId") SELECT "createdAt", "durability", "id", "itemId", "updatedAt", "userId" FROM "UserItemInstance";
DROP TABLE "UserItemInstance";
ALTER TABLE "new_UserItemInstance" RENAME TO "UserItemInstance";
CREATE TABLE "new_UserQuestProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "progress" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserQuestProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserQuestProgress_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserQuestProgress" ("createdAt", "id", "progress", "questId", "status", "updatedAt", "userId") SELECT "createdAt", "id", "progress", "questId", "status", "updatedAt", "userId" FROM "UserQuestProgress";
DROP TABLE "UserQuestProgress";
ALTER TABLE "new_UserQuestProgress" RENAME TO "UserQuestProgress";
CREATE UNIQUE INDEX "UserQuestProgress_userId_questId_key" ON "UserQuestProgress"("userId", "questId");
CREATE TABLE "new_UserSkill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserSkill" ("createdAt", "experience", "id", "level", "skillId", "updatedAt", "userId") SELECT "createdAt", "experience", "id", "level", "skillId", "updatedAt", "userId" FROM "UserSkill";
DROP TABLE "UserSkill";
ALTER TABLE "new_UserSkill" RENAME TO "UserSkill";
CREATE UNIQUE INDEX "UserSkill_userId_skillId_key" ON "UserSkill"("userId", "skillId");
CREATE TABLE "new_Zone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredLevel" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Zone" ("createdAt", "description", "id", "name", "requiredLevel", "updatedAt") SELECT "createdAt", "description", "id", "name", "requiredLevel", "updatedAt" FROM "Zone";
DROP TABLE "Zone";
ALTER TABLE "new_Zone" RENAME TO "Zone";
CREATE UNIQUE INDEX "Zone_name_key" ON "Zone"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

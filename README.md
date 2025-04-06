## Project Goal: Discord Economy/Trading Game Engine Core (Expanded Scope)

**Objective:** Develop the core backend engine for a Discord bot game focused on item gathering through labor, player-to-player trading, crafting, skill progression, and economic simulation, set in a modern-world theme. This engine should be built independently first and later integrated into a Discord bot framework (like discord.js or discord.py - *specify your language below*). The game mechanics **exclude** combat. Think conceptually similar to economy aspects of OwO Bot or Dank Memer, but with a unique modern-world focus and expanded features.

**Target Programming Language:** [**Specify your language here, e.g., TypeScript, Python, JavaScript**]

**Core Requirements & Features:**

1.  **Architecture & Design:**
    *   **Object-Oriented Programming (OOP):** Strictly adhere to OOP principles.
    *   **Clean Code:** Follow clean code practices (meaningful names, small functions/methods, DRY, SOLID).
    *   **Modularity & Extensibility:** Design for easy addition of new items, jobs, skills, zones, quests, crafting recipes, market features, etc. Separate concerns clearly (User, Item, Inventory, Actions, Crafting, Market, Quests, Economy, etc.).
    *   **Localization Support:** Design with internationalization/localization in mind (e.g., using text keys instead of hardcoded strings where appropriate for future translation).

2.  **Database (Prisma ORM with SQLite):**
    *   **ORM/Database:** Use Prisma ORM with SQLite initially. Design schema for potential future migration (e.g., PostgreSQL).
    *   **Schema Design:** Propose a Prisma schema including models/tables for (at least):
        *   `User`: Discord User ID, profile info, currency balance, **level**, **experience (xp)**, **current energy**, **max energy**, timestamps, potentially `current_zone_id`, links to skills/quests.
        *   `Item`: Unique ID, name, description, rarity, base value, properties (stackable, tradable, type - e.g., `RESOURCE`, `TOOL`, `CONSUMABLE`, `CRAFTED`), maybe crafting recipe links or tool specs.
        *   `InventorySlot`: Links `User` and `Item`, stores quantity. Consider if unique item instances are needed (e.g., tools with durability, requiring a separate `UserItemInstance` table instead, linking `User` and `Item` with unique ID and `durability`).
        *   `Job` (or `Activity`): Name, description, **energy cost**, potential item drops (with chances), **xp gain**, **required level/items/tools**, potentially `zone_id`.
        *   **`Skill`**: Skill ID, name, description, effects (e.g., increases drop rate for X, reduces energy cost for Y).
        *   **`UserSkill`**: Links `User` and `Skill`, stores skill level.
        *   **`Tool`** (or integrated into `Item` properties): Tool type, efficiency bonus, durability.
        *   **`Quest`**: Quest ID, name, description, objectives (e.g., gather X item, reach Y level, perform Z action), prerequisites, rewards (items, currency, xp).
        *   **`UserQuestProgress`**: Links `User` and `Quest`, tracks progress towards objectives, status (active, completed).
        *   **`Zone`**: Zone ID, name, description, accessible jobs/resources, entry requirements (level, item).
        *   **`MarketListing`**: Listing ID, Seller User ID, Item ID/UserItemInstance ID, Quantity, Price, Timestamp, Status (active, sold, cancelled).
        *   **`NpcShop`** (Optional): Shop ID, name.
        *   **`NpcShopItem`** (Optional): Links `NpcShop` and `Item`, defines buy/sell price, available stock (if limited).
        *   **`TransactionHistory`**: Records significant economic events (trades, market sales, large NPC transactions) for logging/auditing.
        *   **`Guild`** (Optional, for future): Guild ID, name, owner User ID.
        *   **`GuildMember`** (Optional, for future): Links `Guild` and `User`.
        *   *(Consider `BankAccount` if implementing interest/storage limits)*

3.  **Core Feature Components (Engine Logic - No Discord API calls):**
    *   **User Management:** CRUD for users, manage balance, **level, xp, energy (including regeneration logic)**.
    *   **Item Management:** Define/manage items, including **tools** and their potential **durability**.
    *   **Inventory System:** Add/remove/check items/tools. Handle stackables vs. unique instances (if using `UserItemInstance`).
    *   **Action/Work System:** Handle performing `Job`s, calculate energy cost, xp gain, item drops based on job definitions, **user skills, equipped tools, and current zone**.
    *   **Leveling & Skill System:** Process XP gain, handle level-ups, apply skill effects to relevant actions.
    *   **Crafting System:** Define recipes, check user inventory for ingredients, consume ingredients, create output item.
    *   **Trading System:** Atomic player-to-player transfers (items/currency).
    *   **Quest System:** Logic for accepting quests, tracking objective progress (e.g., hook into item gain or action completion events), granting rewards.
    *   **Zone System:** Logic for checking access requirements and potentially determining available actions/resources based on user's current zone.
    *   **Player Market System:** Create listings, search/browse listings, execute buy orders (atomic transfer of item/currency, potentially with a market tax).
    *   **NPC Shop System (Optional):** Basic buy/sell logic against predefined NPC inventories/prices.
    *   **Economy Simulation:** Currency management, potentially basic supply/demand factors influencing NPC prices or event-driven price changes later.
    *   **Guild System (Basic Structure):** Foundational logic for creating/joining guilds (more features later).
    *   **Transaction Logging:** Service to log important transactions to `TransactionHistory`.

4.  **Performance, Optimization & Technical Considerations:**
    *   **Caching Strategy:** Implement caching for frequently accessed, rarely changing data (item defs, skill defs, zone defs, maybe user profiles). Suggest mechanisms (in-memory, Redis).
    *   **Database Query Optimization:** Efficient Prisma usage (select fields, use indices, batching). Pay attention to queries involving inventory, market listings. Use Prisma's transaction features for atomic operations (trading, crafting, market buys).
    *   **Memory Management:** Be mindful of object creation and data loading.
    *   **Rate Limiting Hooks:** While implemented at the bot level, design engine functions considering they might be rate-limited (e.g., return specific errors if an action fails due to business logic vs. technical limits).
    *   **Backup & Recovery:** Note the need for regular SQLite backups (or standard DB backup procedures if migrating later).
    *   **Admin Functionality Hooks:** Design services (UserService, ItemService) anticipating the need for admin commands later (e.g., `setUserBalance`, `grantItem`, `setQuestStatus`).

**Request for Copilot:**

*   Provide foundational class structures/interfaces for key components (e.g., `UserService`, `InventoryService`, `ItemService`, `ActionHandler`, `CraftingService`, `MarketplaceService`, `QuestService`, `SkillService`, `EnergyService`).
*   Suggest function signatures for core operations incorporating the new features (e.g., `work(userId, jobId)`, `craft(userId, recipeId)`, `listMarketItem(userId, inventorySlotId/userItemInstanceId, quantity, price)`, `acceptQuest(userId, questId)`).
*   Generate an updated basic Prisma schema (`schema.prisma`) reflecting the expanded models and fields described above (User level/xp/energy, Skills, Quests, Zones, Tools/Durability concept, TransactionHistory).
*   Offer examples of how caching could apply to item/skill definitions.
*   Show how energy consumption/regeneration and XP gain might be integrated into the `UserService` or an `ActionHandler`.
*   Demonstrate atomic transaction usage with Prisma for a trade or market purchase.
*   Provide code snippets illustrating clean code, OOP, and modularity within this expanded context.
*   Suggest patterns for handling dependencies between services (e.g., `ActionHandler` needing `InventoryService`, `UserService`, `SkillService`).

**Example Expanded Core Loop (Conceptual):**
User (via Discord) -> Bot Interface -> **Game Engine:** `ActionHandler.performWork(userId, 'mine_ore')`
-> **Engine:** Check `UserService` for energy, level requirements, `ZoneService` for location access.
-> **Engine:** Check `InventoryService` for required tool (e.g., 'pickaxe') & check its durability.
-> **Engine:** Calculate outcomes (energy cost, xp gain, ore drop chance) considering `Job` definition, `SkillService` effects (e.g., mining skill), `Tool` efficiency.
-> **Engine:** Use Prisma transaction:
    -> `UserService.consumeEnergy(userId, cost)`
    -> `UserService.addExperience(userId, xp)` (handle level up if needed)
    -> `InventoryService.updateToolDurability(userId, toolInstanceId, -1)` (if applicable)
    -> `InventoryService.addItem(userId, 'iron_ore', amount)`
    -> `QuestService.notifyAction(userId, 'WORK', { jobId: 'mine_ore', itemsGained: {'iron_ore': amount} })` (Quest system checks if this progresses any active quest)
    -> `TransactionHistoryService.log(...)` (if needed)
-> **Engine:** Commit transaction.
-> **Game Engine:** Return detailed result (success/fail, items gained, xp gained, energy left, quest progress update) -> Bot Interface -> User.
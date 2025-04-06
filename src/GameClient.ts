import { DatabaseContext } from "./utils/DatabaseContext";

// Services
import { UserService } from "./services/UserService";
import { InventoryService } from "./services/InventoryService";
import { ItemService } from "./services/ItemService";
import { SkillService } from "./services/SkillService";
import { SkillTreeService } from "./services/SkillTreeService";
import { ZoneService } from "./services/ZoneService";
import { QuestService } from "./services/QuestService";
import { CraftingService } from "./services/CraftingService";
import { MarketplaceService } from "./services/MarketplaceService";
import { EquipmentEnhancementService } from "./services/EquipmentEnhancementService";
import { ActionHandler } from "./services/ActionHandler";

// Interfaces
import { IUserService } from "./interfaces/IUserService";
import { IInventoryService } from "./interfaces/IInventoryService";
import { IItemService } from "./interfaces/IItemService";
import { ISkillService } from "./interfaces/ISkillService";
import { ISkillTreeService } from "./interfaces/ISkillTreeService";
import { IZoneService } from "./interfaces/IZoneService";
import { IQuestService } from "./interfaces/IQuestService";
import { ICraftingService } from "./interfaces/ICraftingService";
import { IMarketplaceService } from "./interfaces/IMarketplaceService";
import { IEquipmentEnhancementService } from "./interfaces/IEquipmentEnhancementService";
import { IActionHandler } from "./interfaces/IActionHandler";

// Utils
import { ExperienceCalculator } from "./utils/ExperienceCalculator";
import { EnergyManager } from "./utils/EnergyManager";
import { CacheManager } from "./utils/CacheManager";
import { EventEmitter } from "events";

// Type definition for game events
export interface GameEvent {
  eventType: string;
  userId?: string;
  data?: any;
  timestamp: Date;
}

/**
 * GameClient is the main entry point to interact with the game engine.
 * It manages all services and provides an organized way to access game functionality.
 */
export class GameClient {
  // Database context
  private db: DatabaseContext;

  // Core services
  private _userService: UserService;
  private _inventoryService: InventoryService;
  private _itemService: ItemService;
  private _skillService: SkillService;
  private _skillTreeService: SkillTreeService;
  private _zoneService: ZoneService;
  private _questService: QuestService;
  private _craftingService: CraftingService;
  private _marketplaceService: MarketplaceService;
  private _equipmentEnhancementService: EquipmentEnhancementService;
  private _actionHandler: ActionHandler;

  // Event emitter for game events
  private eventEmitter: EventEmitter;

  // Singleton instance
  private static _instance: GameClient;

  /**
   * Get the singleton instance of GameClient
   */
  public static getInstance(): GameClient {
    if (!GameClient._instance) {
      GameClient._instance = new GameClient();
    }
    return GameClient._instance;
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    // Initialize database context
    this.db = DatabaseContext.getInstance();

    // Initialize core services
    this._itemService = new ItemService();
    this._userService = new UserService();
    this._inventoryService = new InventoryService(this._itemService);
    this._skillService = new SkillService();
    this._zoneService = new ZoneService();
    this._skillTreeService = new SkillTreeService(this._userService);
    this._questService = new QuestService(
      this._userService,
      this._inventoryService,
      this._itemService,
      this._zoneService
    );
    this._craftingService = new CraftingService(
      this._inventoryService,
      this._userService,
      this._skillService,
      this._itemService
    );
    this._marketplaceService = new MarketplaceService(
      this._userService,
      this._inventoryService,
      this._itemService
    );
    this._equipmentEnhancementService = new EquipmentEnhancementService(
      this._inventoryService
    );
    this._actionHandler = new ActionHandler(
      this._userService,
      this._inventoryService,
      this._itemService,
      this._skillService,
      this._zoneService,
      this._questService
    );

    // Initialize event emitter
    this.eventEmitter = new EventEmitter();

    console.log("GameClient initialized successfully");
  }

  // Services getters
  get userService(): IUserService {
    return this._userService;
  }

  get inventoryService(): IInventoryService {
    return this._inventoryService;
  }

  get itemService(): IItemService {
    return this._itemService;
  }

  get skillService(): ISkillService {
    return this._skillService;
  }

  get skillTreeService(): ISkillTreeService {
    return this._skillTreeService;
  }

  get zoneService(): IZoneService {
    return this._zoneService;
  }

  get questService(): IQuestService {
    return this._questService;
  }

  get craftingService(): ICraftingService {
    return this._craftingService;
  }

  get marketplaceService(): IMarketplaceService {
    return this._marketplaceService;
  }

  get equipmentEnhancementService(): IEquipmentEnhancementService {
    return this._equipmentEnhancementService;
  }

  get actionHandler(): IActionHandler {
    return this._actionHandler;
  }

  /**
   * Initialize the game by running any necessary setup procedures
   */
  async initialize(): Promise<void> {
    // Run any database migrations if needed
    await this.db.connect();

    // Refresh any caches
    await this._itemService.refreshCache();
    await this._skillService.refreshCache();

    // Initialize average user level
    await this._userService.updateAverageUserLevel();

    // Refresh daily and weekly quests
    await this._questService.refreshDailyQuests();
    await this._questService.refreshWeeklyQuests();

    console.log("GameClient fully initialized");
    return Promise.resolve();
  }

  /**
   * Start a scheduled task to refresh daily quests
   */
  startDailyQuestRefresher(): void {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    // Set the initial timer to the next midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const initialDelay = tomorrow.getTime() - now.getTime();

    setTimeout(async () => {
      await this._questService.refreshDailyQuests();
      console.log("Daily quests refreshed");

      // Set up recurring refresh every 24 hours
      setInterval(async () => {
        await this._questService.refreshDailyQuests();
        console.log("Daily quests refreshed");
      }, TWENTY_FOUR_HOURS);
    }, initialDelay);

    console.log(
      `Daily quest refresher scheduled for ${tomorrow.toLocaleString()}`
    );
  }

  /**
   * Start a scheduled task to refresh weekly quests
   */
  startWeeklyQuestRefresher(): void {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    // Set the initial timer to the next Monday at midnight
    const now = new Date();
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + (((7 - now.getDay()) % 7) + 1));
    nextMonday.setHours(0, 0, 0, 0);

    const initialDelay = nextMonday.getTime() - now.getTime();

    setTimeout(async () => {
      await this._questService.refreshWeeklyQuests();
      console.log("Weekly quests refreshed");

      // Set up recurring refresh every 7 days
      setInterval(async () => {
        await this._questService.refreshWeeklyQuests();
        console.log("Weekly quests refreshed");
      }, SEVEN_DAYS);
    }, initialDelay);

    console.log(
      `Weekly quest refresher scheduled for ${nextMonday.toLocaleString()}`
    );
  }

  /**
   * Start a scheduled task to update average user level
   */
  startAverageUserLevelUpdater(): void {
    const SIX_HOURS = 6 * 60 * 60 * 1000;

    // Update immediately, then every 6 hours
    this._userService.updateAverageUserLevel().then(() => {
      console.log("Average user level updated");
    });

    setInterval(async () => {
      await this._userService.updateAverageUserLevel();
      console.log("Average user level updated");
    }, SIX_HOURS);

    console.log("Average user level updater started");
  }

  /**
   * Start a scheduled task to clean up expired marketplace listings
   */
  startMarketplaceCleanup(): void {
    const ONE_HOUR = 60 * 60 * 1000;

    setInterval(async () => {
      await this._marketplaceService.cleanupExpiredListings();
      console.log("Expired marketplace listings cleaned up");
    }, ONE_HOUR);

    console.log("Marketplace cleanup task started");
  }

  /**
   * Start all scheduled tasks
   */
  startScheduledTasks(): void {
    this.startDailyQuestRefresher();
    this.startWeeklyQuestRefresher();
    this.startAverageUserLevelUpdater();
    this.startMarketplaceCleanup();

    console.log("All scheduled tasks started");
  }

  /**
   * Update the last active timestamp for a user
   * @param userId The user ID to update
   */
  async updateUserActivity(userId: string): Promise<void> {
    await this.db.getClient().user.update({
      where: { id: userId },
      data: { lastActive: new Date() },
    });
  }

  /**
   * Get current XP multiplier events
   */
  getXpMultiplierEvents(): Promise<any[]> {
    return this.db.getClient().xpMultiplierEvent.findMany({
      where: {
        startTime: { lte: new Date() },
        endTime: { gte: new Date() },
      },
    });
  }

  /**
   * Create a new XP multiplier event
   * @param name Name of the event
   * @param multiplier XP multiplier value
   * @param startTime When the event starts
   * @param endTime When the event ends
   * @param description Optional description of the event
   */
  async createXpMultiplierEvent(
    name: string,
    multiplier: number,
    startTime: Date,
    endTime: Date,
    description: string
  ): Promise<any> {
    const event = await this.db.getClient().xpMultiplierEvent.create({
      data: {
        name,
        multiplier,
        startTime,
        endTime,
        description,
      },
    });

    this.emitEvent({
      eventType: "XP_MULTIPLIER_EVENT_CREATED",
      data: { eventId: event.id, name, multiplier },
      timestamp: new Date(),
    });

    return event;
  }

  /**
   * Log game metrics for analytics
   */
  async logGameMetrics(metrics: {
    action: string;
    userId?: string;
    data?: any;
  }): Promise<void> {
    await this.db.getClient().gameMetric.create({
      data: {
        action: metrics.action,
        userId: metrics.userId,
        data: metrics.data ? JSON.stringify(metrics.data) : null,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Register or create a new user
   */
  async registerUser(discordId: string, username: string): Promise<any> {
    // Check if user already exists
    const existingUser = await this._userService.getUserByDiscordId(discordId);
    if (existingUser) {
      return existingUser;
    }

    // Create new user
    const user = await this._userService.createUser(discordId, username);

    // Emit user created event
    this.emitEvent({
      eventType: "USER_REGISTERED",
      userId: user.id,
      timestamp: new Date(),
    });

    return user;
  }

  /**
   * Perform a work action for a user
   */
  async performWork(
    userId: string,
    jobId: string,
    toolInstanceId?: string
  ): Promise<any> {
    // Update user's last active timestamp
    await this.updateUserActivity(userId);

    // Perform the work
    const result = await this._actionHandler.performWork(
      userId,
      jobId,
      toolInstanceId
    );

    // If successful, emit event
    if (result.success) {
      this.emitEvent({
        eventType: "WORK_PERFORMED",
        userId,
        data: {
          jobId,
          xpGained: result.xpGained,
          itemsGained: result.itemsGained,
          leveledUp: result.leveledUp,
        },
        timestamp: new Date(),
      });

      // Log metrics
      await this.logGameMetrics({
        action: "WORK_PERFORMED",
        userId,
        data: {
          jobId,
          xpGained: result.xpGained,
          itemCount: result.itemsGained.length,
        },
      });
    }

    return result;
  }

  /**
   * Craft an item for a user
   */
  async craftItem(userId: string, recipeId: string): Promise<any> {
    // Update user's last active timestamp
    await this.updateUserActivity(userId);

    // Perform crafting
    const result = await this._craftingService.craft(userId, recipeId);

    // If successful, emit event
    if (result.success && result.resultItem) {
      this.emitEvent({
        eventType: "ITEM_CRAFTED",
        userId,
        data: {
          recipeId,
          itemId: result.resultItem.id,
          quantity: result.resultQuantity,
          criticalSuccess: result.criticalSuccess,
        },
        timestamp: new Date(),
      });

      // Log metrics
      await this.logGameMetrics({
        action: "ITEM_CRAFTED",
        userId,
        data: {
          recipeId,
          itemId: result.resultItem.id,
          quantity: result.resultQuantity,
        },
      });
    }

    return result;
  }

  /**
   * Accept a quest for a user
   */
  async acceptQuest(userId: string, questId: string): Promise<boolean> {
    // Update user's last active timestamp
    await this.updateUserActivity(userId);

    // Accept the quest
    const result = await this._questService.acceptQuest(userId, questId);

    // If successful, emit event
    if (result) {
      const quest = await this._questService.getQuestById(questId);
      this.emitEvent({
        eventType: "QUEST_ACCEPTED",
        userId,
        data: {
          questId,
          questName: quest?.name,
        },
        timestamp: new Date(),
      });
    }

    return result;
  }

  /**
   * Complete a quest for a user
   */
  async completeQuest(userId: string, questId: string): Promise<any> {
    // Update user's last active timestamp
    await this.updateUserActivity(userId);

    // Complete the quest
    const result = await this._questService.completeQuest(userId, questId);

    // If successful, emit event
    if (result.success) {
      this.emitEvent({
        eventType: "QUEST_COMPLETED",
        userId,
        data: {
          questId,
          questName: result.quest?.name,
          rewards: result.rewards,
        },
        timestamp: new Date(),
      });

      // Log metrics
      await this.logGameMetrics({
        action: "QUEST_COMPLETED",
        userId,
        data: {
          questId,
          rewardCount: result.rewards?.length || 0,
        },
      });
    }

    return result;
  }

  /**
   * Get information about a user's progress
   */
  async getUserProgress(userId: string): Promise<any> {
    const user = await this._userService.getUserById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Get all relevant user statistics
    const userStats = await this._userService.getUserStats(userId);

    // Get active quests
    const activeQuests = await this._questService.getUserActiveQuests(userId);

    // Get user skills
    const skills = await this._skillService.getUserSkills(userId);

    // Get user titles and badges
    const titles = await this._userService.getUserTitles(userId);
    const badges = await this._userService.getUserBadges(userId);

    // Get user's unclaimed rewards
    const unclaimedRewards = await this.db
      .getClient()
      .milestoneReward.findMany({
        where: {
          userId,
          claimed: false,
        },
      });

    return {
      user,
      stats: userStats,
      activeQuestCount: activeQuests.length,
      skillCount: skills.length,
      titleCount: titles.length,
      badgeCount: badges.length,
      unclaimedRewardCount: unclaimedRewards.length,
    };
  }

  /**
   * Emit a game event
   */
  emitEvent(event: GameEvent): void {
    this.eventEmitter.emit(event.eventType, event);

    // Also emit a generic 'gameEvent' that catches all events
    this.eventEmitter.emit("gameEvent", event);
  }

  /**
   * Subscribe to a specific game event
   */
  onEvent(eventType: string, listener: (event: GameEvent) => void): void {
    this.eventEmitter.on(eventType, listener);
  }

  /**
   * Subscribe to all game events
   */
  onAnyEvent(listener: (event: GameEvent) => void): void {
    this.eventEmitter.on("gameEvent", listener);
  }

  /**
   * Remove a specific event listener
   */
  removeEventListener(
    eventType: string,
    listener: (event: GameEvent) => void
  ): void {
    this.eventEmitter.removeListener(eventType, listener);
  }

  /**
   * Close all connections and perform cleanup
   */
  async shutdown(): Promise<void> {
    console.log("Shutting down GameClient...");

    // Close database connection
    await this.db.disconnect();

    // Remove all event listeners
    this.eventEmitter.removeAllListeners();

    console.log("GameClient shutdown complete");
  }
}

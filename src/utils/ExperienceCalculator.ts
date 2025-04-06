/**
 * Utility class for experience calculations and level conversions
 */
export class ExperienceCalculator {
  /**
   * The base XP required for level 2
   * Each subsequent level scales by the xpScalingFactor
   */
  private static readonly baseXP: number = 100;

  /**
   * The factor by which XP requirements scale per level
   * Example: Each level requires 1.2x more XP than the previous level
   */
  private static readonly xpScalingFactor: number = 1.2;

  /**
   * The maximum level that can be achieved
   */
  private static readonly maxLevel: number = 100;

  /**
   * Significant milestone levels that should trigger special rewards
   */
  private static readonly milestones: number[] = [10, 25, 50, 75, 100];

  /**
   * XP Multiplier event configuration
   */
  private static _activeMultipliers: XpMultiplierEvent[] = [];

  /**
   * Catch-up XP boost configuration
   * Users below this level compared to the server average will get boosted XP
   */
  private static readonly catchupThreshold: number = 5;

  /**
   * Maximum catch-up multiplier (at maximum level difference)
   */
  private static readonly maxCatchupMultiplier: number = 1.5;

  /**
   * Average user level on the server (should be updated periodically)
   */
  private static _averageUserLevel: number = 1;

  // Getters and setters for dynamic properties

  /**
   * Get currently active XP multiplier events
   */
  public static get activeMultipliers(): XpMultiplierEvent[] {
    // Filter out expired events
    this._activeMultipliers = this._activeMultipliers.filter(
      (event) => event.endTime > Date.now()
    );
    return [...this._activeMultipliers];
  }

  /**
   * Set the average user level in the system
   * This should be updated periodically by an analytics job
   */
  public static set averageUserLevel(level: number) {
    this._averageUserLevel = Math.max(1, level);
  }

  /**
   * Get the average user level
   */
  public static get averageUserLevel(): number {
    return this._averageUserLevel;
  }

  /**
   * Calculate the total XP required for a given level
   */
  public static getXpForLevel(level: number): number {
    if (level <= 1) return 0;
    if (level > this.maxLevel) level = this.maxLevel;

    let totalXp = 0;
    for (let i = 1; i < level; i++) {
      totalXp += this.getXpRequiredForNextLevel(i);
    }

    return Math.floor(totalXp);
  }

  /**
   * Calculate the XP required to progress from the current level to the next level
   */
  public static getXpRequiredForNextLevel(currentLevel: number): number {
    if (currentLevel >= this.maxLevel) return Infinity;

    // Calculate XP needed - scales with level
    return Math.floor(
      this.baseXP * Math.pow(this.xpScalingFactor, currentLevel - 1)
    );
  }

  /**
   * Calculate the level for a given amount of total XP
   */
  public static getLevelFromXp(xp: number): number {
    if (xp <= 0) return 1;

    let level = 1;
    let xpForNextLevel = this.getXpRequiredForNextLevel(level);
    let totalXpNeeded = xpForNextLevel;

    // Keep incrementing level until we find where the XP fits
    while (xp >= totalXpNeeded && level < this.maxLevel) {
      level++;
      xpForNextLevel = this.getXpRequiredForNextLevel(level);
      totalXpNeeded += xpForNextLevel;
    }

    return level;
  }

  /**
   * Calculate XP remaining for the next level
   */
  public static getXpRemainingForNextLevel(totalXp: number): number {
    const currentLevel = this.getLevelFromXp(totalXp);
    if (currentLevel >= this.maxLevel) return 0;

    const xpForCurrentLevel = this.getXpForLevel(currentLevel);
    const xpForNextLevel = this.getXpForLevel(currentLevel + 1);

    return xpForNextLevel - totalXp;
  }

  /**
   * Get the XP progress percentage to the next level
   * @returns A number between 0 and 1 representing completion percentage
   */
  public static getLevelProgress(totalXp: number): number {
    const currentLevel = this.getLevelFromXp(totalXp);
    if (currentLevel >= this.maxLevel) return 1.0;

    const xpStartOfLevel = this.getXpForLevel(currentLevel);
    const xpNeededForLevel = this.getXpRequiredForNextLevel(currentLevel);
    const xpIntoLevel = totalXp - xpStartOfLevel;

    return xpIntoLevel / xpNeededForLevel;
  }

  /**
   * Get detailed XP information for progression display
   *
   * @param totalXp User's current total XP
   * @returns Object containing XP information for progression UI
   */
  public static getRemainingXp(totalXp: number): {
    currentLevel: number;
    currentXp: number;
    nextLevelXp: number;
    xpNeededForNextLevel: number;
    progressPercent: number;
  } {
    const currentLevel = this.getLevelFromXp(totalXp);
    const xpStartOfLevel = this.getXpForLevel(currentLevel);
    const xpIntoLevel = totalXp - xpStartOfLevel;
    const xpRequiredForNextLevel = this.getXpRequiredForNextLevel(currentLevel);
    const xpNeededForNextLevel = xpRequiredForNextLevel - xpIntoLevel;
    const progressPercent = Math.min(1, xpIntoLevel / xpRequiredForNextLevel);

    return {
      currentLevel,
      currentXp: xpIntoLevel,
      nextLevelXp: xpRequiredForNextLevel,
      xpNeededForNextLevel,
      progressPercent,
    };
  }

  /**
   * Check if a level is a milestone level that deserves rewards
   * @param level The level to check
   * @returns True if the level is a milestone level
   */
  public static isMilestoneLevel(level: number): boolean {
    return this.milestones.includes(level);
  }

  /**
   * Get reward suggestions for reaching a milestone level
   * @param level The milestone level reached
   * @returns Array of reward suggestions or empty array if not a milestone
   */
  public static getMilestoneRewards(level: number): MilestoneReward[] {
    if (!this.isMilestoneLevel(level)) {
      return [];
    }

    // Define rewards based on milestone level
    switch (level) {
      case 10:
        return [
          {
            id: "reward_10_1",
            type: "CURRENCY",
            rewardType: "CURRENCY",
            amount: 1000,
            description: "Level 10 achievement bonus",
          },
          {
            id: "reward_10_2",
            type: "ITEM",
            rewardType: "ITEM",
            itemId: "basic_lootbox",
            description: "Basic loot box",
          },
        ];
      case 25:
        return [
          {
            id: "reward_25_1",
            type: "CURRENCY",
            rewardType: "CURRENCY",
            amount: 3000,
            description: "Level 25 achievement bonus",
          },
          {
            id: "reward_25_2",
            type: "ITEM",
            rewardType: "ITEM",
            itemId: "standard_lootbox",
            description: "Standard loot box",
          },
          {
            id: "reward_25_3",
            type: "ENERGY",
            rewardType: "ENERGY",
            amount: 50,
            description: "Energy potion",
          },
        ];
      case 50:
        return [
          {
            id: "reward_50_1",
            type: "CURRENCY",
            rewardType: "CURRENCY",
            amount: 10000,
            description: "Level 50 achievement bonus",
          },
          {
            id: "reward_50_2",
            type: "ITEM",
            rewardType: "ITEM",
            itemId: "premium_lootbox",
            description: "Premium loot box",
          },
          {
            id: "reward_50_3",
            type: "ENERGY",
            rewardType: "ENERGY",
            amount: 100,
            description: "Large energy potion",
          },
          {
            id: "reward_50_4",
            type: "TITLE",
            rewardType: "TITLE",
            titleId: "veteran",
            description: "Veteran title",
          },
        ];
      case 75:
        return [
          {
            id: "reward_75_1",
            type: "CURRENCY",
            rewardType: "CURRENCY",
            amount: 25000,
            description: "Level 75 achievement bonus",
          },
          {
            id: "reward_75_2",
            type: "ITEM",
            rewardType: "ITEM",
            itemId: "elite_lootbox",
            description: "Elite loot box",
          },
          {
            id: "reward_75_3",
            type: "ENERGY",
            rewardType: "ENERGY",
            amount: 200,
            description: "Extra large energy potion",
          },
          {
            id: "reward_75_4",
            type: "TITLE",
            rewardType: "TITLE",
            titleId: "master",
            description: "Master title",
          },
        ];
      case 100:
        return [
          {
            id: "reward_100_1",
            type: "CURRENCY",
            rewardType: "CURRENCY",
            amount: 100000,
            description: "Level 100 achievement bonus",
          },
          {
            id: "reward_100_2",
            type: "ITEM",
            rewardType: "ITEM",
            itemId: "legendary_lootbox",
            description: "Legendary loot box",
          },
          {
            id: "reward_100_3",
            type: "ENERGY",
            rewardType: "ENERGY",
            amount: 500,
            description: "Ultimate energy potion",
          },
          {
            id: "reward_100_4",
            type: "TITLE",
            rewardType: "TITLE",
            titleId: "legend",
            description: "Legend title",
          },
          {
            id: "reward_100_5",
            type: "SPECIAL",
            rewardType: "SPECIAL",
            specialId: "prestige_unlock",
            description: "Prestige system unlock",
          },
        ];
      default:
        return [];
    }
  }

  /**
   * Register a new XP multiplier event
   * @param event The XP multiplier event to register
   */
  public static addXpMultiplierEvent(event: XpMultiplierEvent): void {
    if (event.endTime <= Date.now()) {
      return; // Don't add expired events
    }

    // Add the event to active multipliers
    this._activeMultipliers.push(event);
  }

  /**
   * Remove an XP multiplier event by ID
   * @param eventId The ID of the event to remove
   * @returns True if the event was found and removed, false otherwise
   */
  public static removeXpMultiplierEvent(eventId: string): boolean {
    const initialLength = this._activeMultipliers.length;
    this._activeMultipliers = this._activeMultipliers.filter(
      (event) => event.id !== eventId
    );
    return this._activeMultipliers.length < initialLength;
  }

  /**
   * Calculate the total XP multiplier based on active events
   * @param userId Optional user ID to apply user-specific multipliers
   * @param zoneId Optional zone ID to apply zone-specific multipliers
   * @returns The total XP multiplier to apply
   */
  public static getActiveXpMultiplier(
    userId?: string,
    zoneId?: string
  ): number {
    const activeEvents = this.activeMultipliers;

    if (activeEvents.length === 0) {
      return 1.0; // No active multipliers
    }

    let multiplier = 1.0;

    // Apply all relevant multipliers (stacking multiplicatively)
    for (const event of activeEvents) {
      // Check if the event applies globally or to this specific user/zone
      const appliesToUser = !event.userIds || event.userIds.includes(userId!);
      const appliesToZone = !event.zoneIds || event.zoneIds.includes(zoneId!);

      if (
        (userId === undefined || appliesToUser) &&
        (zoneId === undefined || appliesToZone)
      ) {
        multiplier *= event.multiplier;
      }
    }

    return multiplier;
  }

  /**
   * Calculate catch-up XP multiplier for a user based on their level
   * @param userLevel The current level of the user
   * @returns A multiplier between 1.0 and maxCatchupMultiplier
   */
  public static getCatchupMultiplier(userLevel: number): number {
    // If user is at or above average level, no catch-up bonus
    if (userLevel >= this._averageUserLevel) {
      return 1.0;
    }

    // Calculate level difference, capped at catchupThreshold
    const levelDifference = Math.min(
      this._averageUserLevel - userLevel,
      this.catchupThreshold
    );

    // Linear scaling of the multiplier from 1.0 to maxCatchupMultiplier
    const catchupBonus =
      (levelDifference / this.catchupThreshold) *
      (this.maxCatchupMultiplier - 1.0);

    return 1.0 + catchupBonus;
  }

  /**
   * Calculate the actual XP earned with all multipliers applied
   * @param baseXp The base XP amount to be awarded
   * @param userLevel Current user level for catch-up calculation
   * @param userId Optional user ID for user-specific event multipliers
   * @param zoneId Optional zone ID for location-specific multipliers
   * @returns The actual XP to award after all multipliers are applied
   */
  public static calculateActualXpEarned(
    baseXp: number,
    userLevel: number,
    userId?: string,
    zoneId?: string
  ): {
    totalXp: number;
    baseXp: number;
    eventMultiplier: number;
    catchupMultiplier: number;
  } {
    const eventMultiplier = this.getActiveXpMultiplier(userId, zoneId);
    const catchupMultiplier = this.getCatchupMultiplier(userLevel);

    // Calculate total XP (base × event multiplier × catch-up multiplier)
    const totalXp = Math.floor(baseXp * eventMultiplier * catchupMultiplier);

    return {
      totalXp,
      baseXp,
      eventMultiplier,
      catchupMultiplier,
    };
  }
}

/**
 * Represents an XP multiplier event
 */
export interface XpMultiplierEvent {
  /**
   * Unique identifier for the event
   */
  id: string;

  /**
   * Name of the event (e.g., "Weekend Double XP")
   */
  name: string;

  /**
   * Description of the event
   */
  description: string;

  /**
   * The XP multiplier value (e.g., 2.0 for double XP)
   */
  multiplier: number;

  /**
   * When the event starts (timestamp)
   */
  startTime: number;

  /**
   * When the event ends (timestamp)
   */
  endTime: number;

  /**
   * Optional list of user IDs this multiplier applies to
   * If undefined or empty, applies to all users
   */
  userIds?: string[];

  /**
   * Optional list of zone IDs this multiplier applies to
   * If undefined or empty, applies to all zones
   */
  zoneIds?: string[];
}

/**
 * Represents a milestone level reward
 */
export interface MilestoneReward {
  /**
   * Unique identifier for the reward
   */
  id: string;
  
  /**
   * Type of reward (deprecated, use rewardType instead)
   */
  type?: 'CURRENCY' | 'ITEM' | 'ENERGY' | 'TITLE' | 'SPECIAL';
  
  /**
   * Type of reward (matches the RewardType enum)
   */
  rewardType: 'CURRENCY' | 'ITEM' | 'ENERGY' | 'MAX_ENERGY' | 'TITLE' | 'BADGE' | 'SPECIAL';
  
  /**
   * Amount (for currency/energy types)
   */
  amount?: number;
  
  /**
   * Item ID (for item type)
   */
  itemId?: string;
  
  /**
   * Title ID (for title type)
   */
  titleId?: string;
  
  /**
   * Badge ID (for badge type)
   */
  badgeId?: string;
  
  /**
   * Special reward ID (for special type)
   */
  specialId?: string;
  
  /**
   * Human-readable description of the reward
   */
  description: string;
}

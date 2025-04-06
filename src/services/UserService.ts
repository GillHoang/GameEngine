import {
  User,
  UserSkill,
  PrestigePerk,
  UserPrestigePerk,
  Title,
  Badge,
  RewardType,
  TitleRarity,
} from "@prisma/client";
import {
  IUserService,
  UserStats,
  ExperienceGainResult,
  PrestigeResult,
} from "../interfaces/IUserService";
import { DatabaseContext } from "../utils/DatabaseContext";
import {
  ExperienceCalculator,
  MilestoneReward,
  XpMultiplierEvent,
} from "../utils/ExperienceCalculator";
import { EnergyManager } from "../utils/EnergyManager";
import { CacheManager } from "../utils/CacheManager";

/**
 * Service responsible for user-related operations
 */
export class UserService implements IUserService {
  private db = DatabaseContext.getInstance().getClient();
  private cache = CacheManager.getInstance();

  // Cache keys
  private readonly MILESTONE_REWARDS_PREFIX = "milestone_rewards_";
  private readonly CLAIMED_REWARDS_PREFIX = "claimed_rewards_";

  /**
   * Create a new user
   */
  async createUser(discordId: string, username: string): Promise<User> {
    return this.db.user.create({
      data: {
        discordId,
        username,
        level: 1,
        experience: 0,
        currency: 0,
        currentEnergy: 100,
        maxEnergy: 100,
      },
    });
  }

  /**
   * Get a user by Discord ID
   */
  async getUserByDiscordId(discordId: string): Promise<User | null> {
    return this.db.user.findUnique({
      where: { discordId },
    });
  }

  /**
   * Get a user by internal ID
   */
  async getUserById(id: string): Promise<User | null> {
    return this.db.user.findUnique({
      where: { id },
    });
  }

  /**
   * Get user stats including prestige information and active title/badge
   */
  async getUserStats(userId: string): Promise<UserStats> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const requiredExp = ExperienceCalculator.getRemainingXp(
      user.experience
    ).nextLevelXp;

    return {
      level: user.level,
      experience: user.experience,
      requiredExperience: requiredExp,
      currentEnergy: user.currentEnergy,
      maxEnergy: user.maxEnergy,
      currency: user.currency,
      prestigeLevel: user.prestigeLevel,
      prestigePoints: user.prestigePoints,
      totalLifetimeExperience: user.totalLifetimeExperience,
      activeTitle: user.activeTitle || undefined,
      activeBadge: user.activeBadge || undefined,
    };
  }

  /**
   * Add currency to a user
   */
  async addCurrency(userId: string, amount: number): Promise<User> {
    if (amount <= 0) {
      throw new Error("Amount must be positive");
    }

    return this.db.user.update({
      where: { id: userId },
      data: {
        currency: {
          increment: amount,
        },
      },
    });
  }

  /**
   * Remove currency from a user
   */
  async removeCurrency(userId: string, amount: number): Promise<User> {
    if (amount <= 0) {
      throw new Error("Amount must be positive");
    }

    const user = await this.getUserById(userId);

    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }

    if (user.currency < amount) {
      throw new Error("Insufficient funds");
    }

    return this.db.user.update({
      where: { id: userId },
      data: {
        currency: {
          decrement: amount,
        },
      },
    });
  }

  /**
   * Transfer currency between users
   */
  async transferCurrency(
    senderId: string,
    receiverId: string,
    amount: number
  ): Promise<boolean> {
    if (senderId === receiverId) {
      throw new Error("Cannot transfer to same user");
    }

    if (amount <= 0) {
      throw new Error("Amount must be positive");
    }

    // Use a transaction to ensure atomicity
    try {
      await this.db.$transaction(async (tx) => {
        // Check if sender has enough funds
        const sender = await tx.user.findUnique({
          where: { id: senderId },
          select: { currency: true },
        });

        if (!sender || sender.currency < amount) {
          throw new Error("Insufficient funds for transfer");
        }

        // Debit sender
        await tx.user.update({
          where: { id: senderId },
          data: { currency: { decrement: amount } },
        });

        // Credit receiver
        await tx.user.update({
          where: { id: receiverId },
          data: { currency: { increment: amount } },
        });

        // Log the transaction
        await tx.transaction.create({
          data: {
            senderId,
            receiverId,
            type: "PLAYER_TRADE",
            amount,
            description: "Currency transfer",
          },
        });
      });

      return true;
    } catch (error) {
      console.error("Currency transfer failed:", error);
      return false;
    }
  }

  /**
   * Consume energy from a user
   */
  async consumeEnergy(userId: string, amount: number): Promise<User> {
    if (amount <= 0) {
      throw new Error("Amount must be positive");
    }

    const user = await this.getUserById(userId);

    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }

    // Regenerate energy based on last update
    const currentEnergy = EnergyManager.calculateRegeneratedEnergy(
      user.currentEnergy,
      user.maxEnergy,
      user.updatedAt
    );

    if (currentEnergy < amount) {
      throw new Error("Insufficient energy");
    }

    // Update user with new energy value
    return this.db.user.update({
      where: { id: userId },
      data: {
        currentEnergy: currentEnergy - amount,
      },
    });
  }

  /**
   * Add energy to a user
   */
  async regenerateEnergy(userId: string, amount: number): Promise<User> {
    if (amount < 0) {
      throw new Error("Amount cannot be negative");
    }

    const user = await this.getUserById(userId);

    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }

    // Calculate current energy after natural regeneration
    const currentEnergy = EnergyManager.calculateRegeneratedEnergy(
      user.currentEnergy,
      user.maxEnergy,
      user.updatedAt
    );

    // Add the specified amount, capped at max energy
    const newEnergy = Math.min(currentEnergy + amount, user.maxEnergy);

    // Update user with new energy value
    return this.db.user.update({
      where: { id: userId },
      data: {
        currentEnergy: newEnergy,
      },
    });
  }

  /**
   * Add experience to a user with prestige tracking
   */
  async addExperience(
    userId: string,
    baseAmount: number,
    zoneId?: string
  ): Promise<ExperienceGainResult> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Get multipliers (events, catchup mechanics, etc)
    const multipliers = await this.getCurrentXpMultipliers(userId);
    const actualXp = Math.ceil(baseAmount * multipliers.totalMultiplier);

    const oldLevel = user.level;
    let newExperience = user.experience + actualXp;
    let newLevel = oldLevel;
    let leveledUp = false;

    // Check for level ups
    while (
      newExperience >=
      ExperienceCalculator.getRemainingXp(newExperience).nextLevelXp
    ) {
      newExperience -=
        ExperienceCalculator.getRemainingXp(newExperience).nextLevelXp;
      newLevel += 1;
      leveledUp = true;
    }

    // Update user with new level, experience, and track total lifetime XP for prestige
    const updatedUser = await this.db.user.update({
      where: { id: userId },
      data: {
        level: newLevel,
        experience: newExperience,
        totalLifetimeExperience: user.totalLifetimeExperience + actualXp,
      },
    });

    // Process milestone rewards if leveled up
    const milestoneRewards = leveledUp
      ? await this.processMilestoneRewards(userId, newLevel)
      : [];

    return {
      user: updatedUser,
      leveledUp,
      oldLevel,
      newLevel,
      baseXp: baseAmount,
      actualXp,
      multipliers: {
        event: multipliers.eventMultiplier,
        catchup: multipliers.catchupMultiplier,
        total: multipliers.totalMultiplier,
      },
      milestoneRewards,
    };
  }

  /**
   * Prestige a user, resetting level but giving permanent bonuses
   */
  async prestigeUser(userId: string): Promise<PrestigeResult> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        return {
          success: false,
          error: `User with ID ${userId} not found`,
        };
      }

      // Check if user meets minimum level requirement (level 50)
      const MIN_PRESTIGE_LEVEL = 50;
      if (user.level < MIN_PRESTIGE_LEVEL) {
        return {
          success: false,
          error: `You must be at least level ${MIN_PRESTIGE_LEVEL} to prestige. You are level ${user.level}.`,
        };
      }

      // Calculate prestige points to award (based on max level reached)
      // More points for higher levels
      const newPrestigePoints = Math.floor(user.level / 10);

      // Reset user level and update prestige information
      const updatedUser = await this.db.user.update({
        where: { id: userId },
        data: {
          level: 1,
          experience: 0,
          prestigeLevel: user.prestigeLevel + 1,
          prestigePoints: user.prestigePoints + newPrestigePoints,
        },
      });

      // Clear skill nodes on prestige but keep prestige perks
      await this.db.userSkillNode.deleteMany({
        where: { userId },
      });

      // Create a special milestone reward for prestige
      await this.db.milestoneReward.create({
        data: {
          id: `prestige-${user.prestigeLevel + 1}-${userId}`,
          userId,
          level: 0, // Special level 0 for prestige rewards
          rewardType: RewardType.SPECIAL,
          description: `Prestige ${
            user.prestigeLevel + 1
          } reward - Energy cap increased by 10%`,
          claimed: true, // Auto-claimed
          claimedAt: new Date(),
        },
      });

      // Update energy state with prestige bonus
      const energyState = await this.db.userEnergyState.findUnique({
        where: { userId },
      });

      if (energyState) {
        // Each prestige level gives +10% max energy
        const prestigeEnergyBonus = 0.1 * updatedUser.prestigeLevel;

        await this.db.userEnergyState.update({
          where: { userId },
          data: {
            passiveMaxEnergyBonus: prestigeEnergyBonus,
            maxEnergy: Math.ceil(100 * (1 + prestigeEnergyBonus)),
            currentEnergy: Math.ceil(100 * (1 + prestigeEnergyBonus)), // Refill energy on prestige
          },
        });
      }

      // Check for and award prestige-related titles
      await this.checkEligibleTitles(userId);

      return {
        success: true,
        user: updatedUser,
        prestigeLevel: updatedUser.prestigeLevel,
        prestigePoints: updatedUser.prestigePoints,
      };
    } catch (error) {
      console.error("Error prestiging user:", error);
      return {
        success: false,
        error: `An error occurred: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Get all prestige perks owned by a user
   */
  async getPrestigePerks(
    userId: string
  ): Promise<(UserPrestigePerk & { prestigePerk: PrestigePerk })[]> {
    return this.db.userPrestigePerk.findMany({
      where: { userId },
      include: {
        prestigePerk: true,
      },
    });
  }

  /**
   * Purchase a new prestige perk for a user
   */
  async purchasePrestigePerk(userId: string, perkId: string): Promise<boolean> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // Get the perk
      const perk = await this.db.prestigePerk.findUnique({
        where: { id: perkId },
      });

      if (!perk) {
        throw new Error(`Prestige perk with ID ${perkId} not found`);
      }

      // Check if user already has this perk
      const existingPerk = await this.db.userPrestigePerk.findUnique({
        where: {
          userId_prestigePerkId: {
            userId,
            prestigePerkId: perkId,
          },
        },
      });

      if (existingPerk) {
        throw new Error("You already own this prestige perk");
      }

      // Check if user has enough prestige points
      if (user.prestigePoints < perk.cost) {
        throw new Error(
          `Insufficient prestige points. You have ${user.prestigePoints}, but need ${perk.cost}`
        );
      }

      // Transaction to deduct points and award perk
      await this.db.$transaction([
        // Deduct prestige points
        this.db.user.update({
          where: { id: userId },
          data: {
            prestigePoints: user.prestigePoints - perk.cost,
          },
        }),

        // Create user perk
        this.db.userPrestigePerk.create({
          data: {
            userId,
            prestigePerkId: perkId,
            level: 1,
          },
        }),
      ]);

      return true;
    } catch (error) {
      console.error("Error purchasing prestige perk:", error);
      return false;
    }
  }

  /**
   * Upgrade an existing prestige perk
   */
  async upgradePrestigePerk(
    userId: string,
    userPrestigePerkId: string
  ): Promise<boolean> {
    try {
      const userPerk = await this.db.userPrestigePerk.findUnique({
        where: { id: userPrestigePerkId },
        include: { prestigePerk: true },
      });

      if (!userPerk) {
        throw new Error(
          `User prestige perk with ID ${userPrestigePerkId} not found`
        );
      }

      if (userPerk.userId !== userId) {
        throw new Error("This prestige perk does not belong to you");
      }

      // Check if perk is already at max level
      if (userPerk.level >= userPerk.prestigePerk.maxLevel) {
        throw new Error(
          `This perk is already at its maximum level (${userPerk.prestigePerk.maxLevel})`
        );
      }

      // Calculate upgrade cost (typically increases with each level)
      const upgradeCost = userPerk.prestigePerk.cost * userPerk.level;

      // Check if user has enough prestige points
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      if (user.prestigePoints < upgradeCost) {
        throw new Error(
          `Insufficient prestige points. You have ${user.prestigePoints}, but need ${upgradeCost}`
        );
      }

      // Transaction to deduct points and upgrade perk
      await this.db.$transaction([
        // Deduct prestige points
        this.db.user.update({
          where: { id: userId },
          data: {
            prestigePoints: user.prestigePoints - upgradeCost,
          },
        }),

        // Upgrade perk
        this.db.userPrestigePerk.update({
          where: { id: userPrestigePerkId },
          data: {
            level: userPerk.level + 1,
          },
        }),
      ]);

      return true;
    } catch (error) {
      console.error("Error upgrading prestige perk:", error);
      return false;
    }
  }

  // ======= Titles and Badges =======

  /**
   * Get all titles owned by a user
   */
  async getUserTitles(userId: string): Promise<Title[]> {
    const userTitles = await this.db.userTitle.findMany({
      where: { userId },
      include: { title: true },
    });

    return userTitles.map((ut) => ut.title);
  }

  /**
   * Get all badges owned by a user
   */
  async getUserBadges(userId: string): Promise<Badge[]> {
    const userBadges = await this.db.userBadge.findMany({
      where: { userId },
      include: { badge: true },
    });

    return userBadges.map((ub) => ub.badge);
  }

  /**
   * Set user's active title
   */
  async setActiveTitle(userId: string, titleId: string | null): Promise<User> {
    // If titleId is null, unset the active title
    if (titleId === null) {
      return this.db.user.update({
        where: { id: userId },
        data: { activeTitle: null },
      });
    }

    // Check if user owns the title
    const userTitle = await this.db.userTitle.findUnique({
      where: {
        userId_titleId: {
          userId,
          titleId,
        },
      },
    });

    if (!userTitle) {
      throw new Error("You don't own this title");
    }

    // Set as active title
    return this.db.user.update({
      where: { id: userId },
      data: { activeTitle: titleId },
    });
  }

  /**
   * Set user's active badge
   */
  async setActiveBadge(userId: string, badgeId: string | null): Promise<User> {
    // If badgeId is null, unset the active badge
    if (badgeId === null) {
      return this.db.user.update({
        where: { id: userId },
        data: { activeBadge: null },
      });
    }

    // Check if user owns the badge
    const userBadge = await this.db.userBadge.findUnique({
      where: {
        userId_badgeId: {
          userId,
          badgeId,
        },
      },
    });

    if (!userBadge) {
      throw new Error("You don't own this badge");
    }

    // Set as active badge
    return this.db.user.update({
      where: { id: userId },
      data: { activeBadge: badgeId },
    });
  }

  /**
   * Check if user is eligible for any titles they don't already own
   */
  async checkEligibleTitles(userId: string): Promise<Title[]> {
    // Get user
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Get all titles user doesn't have
    const userOwnedTitleIds = await this.db.userTitle.findMany({
      where: { userId },
      select: { titleId: true },
    });

    const allTitles = await this.db.title.findMany({
      where: {
        id: {
          notIn: userOwnedTitleIds.map((t) => t.titleId),
        },
      },
    });

    // Check each title's requirements
    const eligibleTitles: Title[] = [];

    for (const title of allTitles) {
      try {
        const requirements = JSON.parse(title.requirement);

        let eligible = true;

        // Check various possible requirements
        if (requirements.minLevel && user.level < requirements.minLevel) {
          eligible = false;
        }

        if (
          requirements.minPrestigeLevel &&
          user.prestigeLevel < requirements.minPrestigeLevel
        ) {
          eligible = false;
        }

        if (
          requirements.minTotalExperience &&
          user.totalLifetimeExperience < requirements.minTotalExperience
        ) {
          eligible = false;
        }

        // If user is eligible, award the title
        if (eligible) {
          await this.awardTitle(userId, title.id);
          eligibleTitles.push(title);
        }
      } catch (error) {
        console.error(
          `Error processing title requirements for ${title.name}:`,
          error
        );
      }
    }

    return eligibleTitles;
  }

  /**
   * Check if user is eligible for any badges they don't already own
   */
  async checkEligibleBadges(userId: string): Promise<Badge[]> {
    // Get user
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Get all badges user doesn't have
    const userOwnedBadgeIds = await this.db.userBadge.findMany({
      where: { userId },
      select: { badgeId: true },
    });

    const allBadges = await this.db.badge.findMany({
      where: {
        id: {
          notIn: userOwnedBadgeIds.map((b) => b.badgeId),
        },
      },
    });

    // Check each badge's requirements
    const eligibleBadges: Badge[] = [];

    for (const badge of allBadges) {
      try {
        const requirements = JSON.parse(badge.requirement);

        let eligible = true;

        // Check various possible requirements
        if (requirements.minQuestsCompleted) {
          const completedQuests = await this.db.userQuestProgress.count({
            where: {
              userId,
              status: "COMPLETED",
            },
          });

          if (completedQuests < requirements.minQuestsCompleted) {
            eligible = false;
          }
        }

        if (requirements.specificItemId) {
          const hasItem = await this.db.inventorySlot.findFirst({
            where: {
              userId,
              itemId: requirements.specificItemId,
            },
          });

          if (!hasItem) {
            eligible = false;
          }
        }

        // If user is eligible, award the badge
        if (eligible) {
          await this.awardBadge(userId, badge.id);
          eligibleBadges.push(badge);
        }
      } catch (error) {
        console.error(
          `Error processing badge requirements for ${badge.name}:`,
          error
        );
      }
    }

    return eligibleBadges;
  }

  /**
   * Award a title to a user
   */
  async awardTitle(userId: string, titleId: string): Promise<boolean> {
    try {
      // Check if title exists
      const title = await this.db.title.findUnique({
        where: { id: titleId },
      });

      if (!title) {
        throw new Error(`Title with ID ${titleId} not found`);
      }

      // Check if user already has this title
      const existingTitle = await this.db.userTitle.findUnique({
        where: {
          userId_titleId: {
            userId,
            titleId,
          },
        },
      });

      if (existingTitle) {
        return true; // Already has the title
      }

      // Award the title
      await this.db.userTitle.create({
        data: {
          userId,
          titleId,
        },
      });

      // If user doesn't have an active title, set this as active
      const user = await this.getUserById(userId);
      if (user && !user.activeTitle) {
        await this.setActiveTitle(userId, titleId);
      }

      return true;
    } catch (error) {
      console.error("Error awarding title:", error);
      return false;
    }
  }

  /**
   * Award a badge to a user
   */
  async awardBadge(userId: string, badgeId: string): Promise<boolean> {
    try {
      // Check if badge exists
      const badge = await this.db.badge.findUnique({
        where: { id: badgeId },
      });

      if (!badge) {
        throw new Error(`Badge with ID ${badgeId} not found`);
      }

      // Check if user already has this badge
      const existingBadge = await this.db.userBadge.findUnique({
        where: {
          userId_badgeId: {
            userId,
            badgeId,
          },
        },
      });

      if (existingBadge) {
        return true; // Already has the badge
      }

      // Award the badge
      await this.db.userBadge.create({
        data: {
          userId,
          badgeId,
        },
      });

      // If user doesn't have an active badge, set this as active
      const user = await this.getUserById(userId);
      if (user && !user.activeBadge) {
        await this.setActiveBadge(userId, badgeId);
      }

      return true;
    } catch (error) {
      console.error("Error awarding badge:", error);
      return false;
    }
  }

  /**
   * Set the level of a user directly (admin function)
   */
  async setLevel(userId: string, level: number): Promise<User> {
    if (level < 1) {
      throw new Error("Level cannot be less than 1");
    }

    return await this.db.user.update({
      where: { id: userId },
      data: { level },
    });
  }

  /**
   * Process milestone rewards for a user who leveled up
   */
  async processMilestoneRewards(
    userId: string,
    level: number
  ): Promise<MilestoneReward[]> {
    // Check if there are any unclaimed milestone rewards for this level
    const existingRewards = await this.db.milestoneReward.findMany({
      where: {
        userId,
        level,
        claimed: false,
      },
    });

    if (existingRewards.length > 0) {
      return existingRewards.map((reward) => ({
        id: reward.id,
        rewardType: reward.rewardType as RewardType,
        description: reward.description,
        amount: reward.amount || 0,
        itemId: reward.itemId || undefined,
      }));
    }

    // Define milestone rewards at specific levels
    const milestones: Record<number, MilestoneReward[]> = {
      5: [
        {
          id: `level-5-currency-${userId}`,
          rewardType: RewardType.CURRENCY,
          description: "Level 5 achievement: 500 currency bonus",
          amount: 500,
        },
      ],
      10: [
        {
          id: `level-10-energy-${userId}`,
          rewardType: RewardType.MAX_ENERGY,
          description: "Level 10 achievement: +10 maximum energy",
          amount: 10,
        },
      ],
      25: [
        {
          id: `level-25-title-${userId}`,
          rewardType: RewardType.TITLE,
          description: "Level 25 achievement: 'Adventurer' title",
          amount: 0,
          titleId: "title_adventurer", // This would need to exist in your titles table
        },
      ],
      50: [
        {
          id: `level-50-currency-${userId}`,
          rewardType: RewardType.CURRENCY,
          description: "Level 50 achievement: 5000 currency bonus",
          amount: 5000,
        },
        {
          id: `level-50-energy-${userId}`,
          rewardType: RewardType.MAX_ENERGY,
          description: "Level 50 achievement: +20 maximum energy",
          amount: 20,
        },
        {
          id: `level-50-title-${userId}`,
          rewardType: RewardType.TITLE,
          description: "Level 50 achievement: 'Veteran' title",
          amount: 0,
          titleId: "title_veteran", // This would need to exist in your titles table
        },
      ],
    };

    // Check if this level has milestone rewards
    const rewards = milestones[level] || [];

    // Store the rewards in the database
    for (const reward of rewards) {
      await this.db.milestoneReward.create({
        data: {
          id: reward.id,
          userId,
          level,
          rewardType: reward.rewardType,
          description: reward.description,
          amount: reward.amount,
          itemId: reward.itemId,
          titleId: reward.titleId,
          badgeId: reward.badgeId,
          claimed: false,
        },
      });
    }

    return rewards;
  }

  /**
   * Claim a milestone reward
   */
  async claimMilestoneReward(
    userId: string,
    rewardId: string
  ): Promise<boolean> {
    try {
      // Find the reward and check if it belongs to the user
      const reward = await this.db.milestoneReward.findUnique({
        where: { id: rewardId },
      });

      if (!reward) {
        throw new Error(`Reward with ID ${rewardId} not found`);
      }

      if (reward.userId !== userId) {
        throw new Error("This reward doesn't belong to you");
      }

      if (reward.claimed) {
        throw new Error("This reward has already been claimed");
      }

      // Process the reward based on type
      switch (reward.rewardType) {
        case RewardType.CURRENCY:
          if (reward.amount) {
            await this.addCurrency(userId, reward.amount);
          }
          break;

        case RewardType.ITEM:
          if (reward.itemId) {
            // Add item to user's inventory (requires inventory service)
            // For now, just log this
            console.log(`Should add item ${reward.itemId} to user ${userId}`);
          }
          break;

        case RewardType.MAX_ENERGY:
          if (reward.amount) {
            // Update user's max energy
            const energyState = await this.db.userEnergyState.findUnique({
              where: { userId },
            });

            if (energyState) {
              await this.db.userEnergyState.update({
                where: { userId },
                data: {
                  maxEnergy: energyState.maxEnergy + reward.amount,
                },
              });
            }
          }
          break;

        case RewardType.TITLE:
          if (reward.titleId) {
            await this.awardTitle(userId, reward.titleId);
          }
          break;

        case RewardType.BADGE:
          if (reward.badgeId) {
            await this.awardBadge(userId, reward.badgeId);
          }
          break;

        case RewardType.SPECIAL:
          // Special rewards may require custom handling
          console.log(`Processing special reward: ${reward.description}`);
          break;
      }

      // Mark the reward as claimed
      await this.db.milestoneReward.update({
        where: { id: rewardId },
        data: {
          claimed: true,
          claimedAt: new Date(),
        },
      });

      return true;
    } catch (error) {
      console.error("Error claiming milestone reward:", error);
      return false;
    }
  }

  /**
   * Get all active XP multipliers for a user
   */
  async getCurrentXpMultipliers(userId: string): Promise<{
    eventMultiplier: number;
    catchupMultiplier: number;
    totalMultiplier: number;
  }> {
    // Get active global events
    const now = new Date();
    const activeEvents = await this.db.xpMultiplierEvent.findMany({
      where: {
        startTime: { lte: now },
        endTime: { gte: now },
      },
    });

    // Calculate event multiplier (take the highest if multiple)
    const eventMultiplier =
      activeEvents.length > 0
        ? Math.max(...activeEvents.map((event) => event.multiplier))
        : 1.0;

    // Calculate catchup mechanics
    // Catchup helps lower level players by giving them bonus XP relative to the server average
    let catchupMultiplier = 1.0;

    // Get server average level
    const avgLevel = await this.getAverageUserLevel();

    // Get user level
    const user = await this.getUserById(userId);
    if (user) {
      // If user is significantly below average, give them a boost
      const levelDifference = avgLevel - user.level;
      if (levelDifference > 5) {
        // 5% bonus XP per level below average, up to 50%
        catchupMultiplier = Math.min(1 + levelDifference * 0.05, 1.5);
      }
    }

    // Calculate total multiplier
    const totalMultiplier = eventMultiplier * catchupMultiplier;

    return {
      eventMultiplier,
      catchupMultiplier,
      totalMultiplier,
    };
  }

  /**
   * Calculate and update the average user level across all users
   */
  async updateAverageUserLevel(): Promise<number> {
    // Get average level of all active users
    const result = await this.db.user.aggregate({
      _avg: {
        level: true,
      },
      where: {
        lastActive: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Active in the last 30 days
        },
      },
    });

    const avgLevel = result._avg.level || 1;

    // Store this value for future reference
    await this.db.$queryRaw`
      INSERT INTO GameStats (key, numericValue, updatedAt)
      VALUES ('averageUserLevel', ${avgLevel}, ${new Date()})
      ON CONFLICT (key) DO UPDATE
      SET numericValue = ${avgLevel}, updatedAt = ${new Date()}
    `;

    return avgLevel;
  }

  /**
   * Get the average user level (cached value)
   */
  private async getAverageUserLevel(): Promise<number> {
    try {
      const stat = await this.db.$queryRaw`
        SELECT numericValue FROM GameStats 
        WHERE key = 'averageUserLevel' 
        LIMIT 1
      `;

      if (Array.isArray(stat) && stat.length > 0 && stat[0].numericValue) {
        return stat[0].numericValue;
      }

      // If no cached value exists, calculate it now
      return this.updateAverageUserLevel();
    } catch (error) {
      console.error("Error fetching average user level:", error);
      return 1; // Default to level 1 if something goes wrong
    }
  }

  /**
   * Set a user's current zone
   */
  async setCurrentZone(userId: string, zoneId: string): Promise<User> {
    return this.db.user.update({
      where: { id: userId },
      data: { currentZoneId: zoneId },
    });
  }

  /**
   * Get a user's current zone
   */
  async getCurrentZone(userId: string): Promise<string | undefined> {
    const user = await this.getUserById(userId);
    return user?.currentZoneId ?? undefined;
  }

  /**
   * Get all skills owned by a user
   */
  async getSkills(userId: string): Promise<UserSkill[]> {
    return this.db.userSkill.findMany({
      where: { userId },
    });
  }
}

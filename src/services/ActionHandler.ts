import { Job, Item } from "@prisma/client";
import {
  IActionHandler,
  WorkResult,
  JobWithRewards,
} from "../interfaces/IActionHandler";
import { DatabaseContext } from "../utils/DatabaseContext";
import { UserService } from "./UserService";
import { InventoryService } from "./InventoryService";
import { ItemService } from "./ItemService";
import { SkillService } from "./SkillService";
import { ZoneService } from "./ZoneService";
import { QuestService } from "./QuestService";

/**
 * Handles work-related actions with job rewards, tool usage, and skill bonuses
 */
export class ActionHandler implements IActionHandler {
  private db = DatabaseContext.getInstance().getClient();
  private userService: UserService;
  private inventoryService: InventoryService;
  private itemService: ItemService;
  private skillService: SkillService;
  private zoneService: ZoneService;
  private questService: QuestService;

  constructor(
    userService: UserService,
    inventoryService: InventoryService,
    itemService: ItemService,
    skillService: SkillService,
    zoneService: ZoneService,
    questService: QuestService
  ) {
    this.userService = userService;
    this.inventoryService = inventoryService;
    this.itemService = itemService;
    this.skillService = skillService;
    this.zoneService = zoneService;
    this.questService = questService;
  }

  /**
   * Perform work action for a user
   */
  async performWork(
    userId: string,
    jobId: string,
    toolInstanceId?: string
  ): Promise<WorkResult> {
    try {
      // Get job details
      const job = await this.getJobById(jobId);
      if (!job) {
        return {
          success: false,
          energyConsumed: 0,
          xpGained: 0,
          itemsGained: [],
          leveledUp: false,
          error: `Job with id ${jobId} not found`,
        };
      }

      // Check if user has required level
      const user = await this.userService.getUserById(userId);
      if (!user) {
        return {
          success: false,
          energyConsumed: 0,
          xpGained: 0,
          itemsGained: [],
          leveledUp: false,
          error: `User with id ${userId} not found`,
        };
      }

      if (user.level < job.requiredLevel) {
        return {
          success: false,
          energyConsumed: 0,
          xpGained: 0,
          itemsGained: [],
          leveledUp: false,
          error: `Job requires level ${job.requiredLevel}, user is level ${user.level}`,
        };
      }

      // Check if job has zone requirement and if user is in correct zone
      if (job.zoneId) {
        const userZoneId = await this.userService.getCurrentZone(userId);

        if (userZoneId !== job.zoneId) {
          const zone = await this.zoneService.getZoneById(job.zoneId);
          return {
            success: false,
            energyConsumed: 0,
            xpGained: 0,
            itemsGained: [],
            leveledUp: false,
            error: `You need to be in ${
              zone?.name || "the correct zone"
            } to do this job`,
          };
        }
      }

      // Check if job requires specific item/tool
      if (job.requiredItemId) {
        const hasRequiredItem = await this.inventoryService.hasItem(
          userId,
          job.requiredItemId,
          1
        );
        if (!hasRequiredItem) {
          const requiredItem = await this.itemService.getItemById(
            job.requiredItemId
          );
          return {
            success: false,
            energyConsumed: 0,
            xpGained: 0,
            itemsGained: [],
            leveledUp: false,
            error: `Job requires item ${
              requiredItem?.name || job.requiredItemId
            }`,
          };
        }
      }

      // Calculate job bonuses from skills
      const skillBonuses = await this.skillService.calculateJobBonus(
        userId,
        jobId
      );

      // Calculate adjusted energy cost
      let energyCost = Math.max(
        1,
        Math.floor(job.energyCost * (1 - skillBonuses.energyReduction))
      );

      // Check if user has enough energy
      if (user.currentEnergy < energyCost) {
        return {
          success: false,
          energyConsumed: 0,
          xpGained: 0,
          itemsGained: [],
          leveledUp: false,
          error: "Not enough energy",
        };
      }

      // Tool usage logic
      let toolEfficiencyBonus = 1.0;
      if (toolInstanceId) {
        const toolInstance = await this.inventoryService.getUserItemInstance(
          toolInstanceId
        );
        if (!toolInstance) {
          return {
            success: false,
            energyConsumed: 0,
            xpGained: 0,
            itemsGained: [],
            leveledUp: false,
            error: `Tool with id ${toolInstanceId} not found`,
          };
        }

        // Check if tool belongs to user
        if (toolInstance.userId !== userId) {
          return {
            success: false,
            energyConsumed: 0,
            xpGained: 0,
            itemsGained: [],
            leveledUp: false,
            error: `Tool does not belong to user`,
          };
        }

        // Check if tool has durability left
        if (toolInstance.durability !== null && toolInstance.durability <= 0) {
          return {
            success: false,
            energyConsumed: 0,
            xpGained: 0,
            itemsGained: [],
            leveledUp: false,
            error: "Tool has no durability left",
          };
        }

        // Get tool efficiency bonus
        const toolSpec = await this.itemService.getToolSpecification(
          toolInstance.itemId
        );
        if (toolSpec) {
          toolEfficiencyBonus = toolSpec.efficiencyBonus;

          // Reduce tool durability
          await this.inventoryService.updateToolDurability(toolInstanceId, -1);
        }
      }

      // Use a transaction to ensure atomicity
      const result = await this.db.$transaction(async (tx) => {
        // Consume energy
        await this.userService.consumeEnergy(userId, energyCost);

        // Calculate XP gained with bonuses
        const xpGained = Math.floor(job.xpReward * (1 + skillBonuses.xpBonus));

        // Add experience
        const xpResult = await this.userService.addExperience(userId, xpGained);

        // Generate rewards
        const itemsGained: Array<{ item: Item; quantity: number }> = [];

        // Process each possible reward
        for (const reward of job.rewards) {
          // Apply drop rate bonus from skills and tool efficiency
          const effectiveChance = Math.min(
            1.0,
            reward.chance *
              (1 + skillBonuses.dropRateBonus) *
              toolEfficiencyBonus
          );

          // Roll for the reward
          if (Math.random() < effectiveChance) {
            // Roll for quantity between min and max
            const quantity =
              Math.floor(
                Math.random() * (reward.maxAmount - reward.minAmount + 1)
              ) + reward.minAmount;

            // Add to inventory
            if (quantity > 0) {
              const item = await this.itemService.getItemById(reward.item.id);
              if (item) {
                await this.inventoryService.addItem(
                  userId,
                  reward.item.id,
                  quantity
                );
                itemsGained.push({ item, quantity });
              }
            }
          }
        }

        // Update quest progress (job completion and item gains)
        await this.questService.updateQuestProgress(userId, "WORK", {
          jobId: job.id,
          itemsGained,
        });

        return {
          success: true,
          energyConsumed: energyCost,
          xpGained,
          itemsGained,
          leveledUp: xpResult.leveledUp,
        };
      });

      return result;
    } catch (error) {
      console.error("Error performing work:", error);
      return {
        success: false,
        energyConsumed: 0,
        xpGained: 0,
        itemsGained: [],
        leveledUp: false,
        error: `An error occurred: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Get available jobs for a user based on level and zone
   */
  async getAvailableJobs(userId: string): Promise<Job[]> {
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }

    const userZoneId = user.currentZoneId;

    // Get jobs that match user's level and zone (if applicable)
    const jobs = await this.db.job.findMany({
      where: {
        requiredLevel: { lte: user.level },
        ...(userZoneId ? { zoneId: userZoneId } : {}),
      },
      orderBy: { requiredLevel: "asc" },
    });

    return jobs;
  }

  /**
   * Get job details including rewards
   */
  async getJobById(jobId: string): Promise<JobWithRewards | null> {
    const job = await this.db.job.findUnique({
      where: { id: jobId },
      include: {
        rewards: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!job) {
      return null;
    }

    // Convert to JobWithRewards format
    return {
      ...job,
      rewards: job.rewards.map((reward) => ({
        item: reward.item,
        minAmount: reward.minAmount,
        maxAmount: reward.maxAmount,
        chance: reward.chance,
      })),
    };
  }

  /**
   * Use a tool for a job to get bonuses
   * This is a simplified wrapper around performWork
   */
  async useToolForJob(
    userId: string,
    jobId: string,
    toolInstanceId: string
  ): Promise<WorkResult> {
    return this.performWork(userId, jobId, toolInstanceId);
  }
}

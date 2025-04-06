import {
  Quest,
  QuestObjective,
  QuestReward,
  QuestStatus,
  QuestType,
  User,
} from "@prisma/client";
import {
  IQuestService,
  QuestObjectiveProgress,
  QuestWithDetails,
  UserQuestWithProgress,
  QuestCompletionResult,
} from "../interfaces/IQuestService";
import { DatabaseContext } from "../utils/DatabaseContext";
import { UserService } from "./UserService";
import { InventoryService } from "./InventoryService";
import { ItemService } from "./ItemService";
import { ZoneService } from "./ZoneService";

/**
 * Service responsible for quest-related operations
 */
export class QuestService implements IQuestService {
  private db = DatabaseContext.getInstance().getClient();
  private userService: UserService;
  private inventoryService: InventoryService;
  private itemService: ItemService;
  private zoneService: ZoneService;

  constructor(
    userService: UserService,
    inventoryService: InventoryService,
    itemService: ItemService,
    zoneService: ZoneService
  ) {
    this.userService = userService;
    this.inventoryService = inventoryService;
    this.itemService = itemService;
    this.zoneService = zoneService;
  }

  /**
   * Get a quest by ID with all its objectives and rewards
   */
  async getQuestById(questId: string): Promise<QuestWithDetails | null> {
    return this.db.quest.findUnique({
      where: { id: questId },
      include: {
        objectives: {
          include: {
            targetItem: true,
          },
        },
        rewards: {
          include: {
            item: true,
          },
        },
      },
    });
  }

  /**
   * Get quests available to a user based on level
   */
  async getAvailableQuestsForUser(userId: string): Promise<QuestWithDetails[]> {
    // Get user information to check level
    const user = await this.userService.getUserById(userId);
    if (!user) {
      return [];
    }

    const currentDate = new Date();

    // Get quests that match the user level requirement
    const quests = await this.db.quest.findMany({
      where: {
        OR: [
          { expiresAt: null },
          { expiresAt: { gte: currentDate } },
        ],
        AND: [
          {
            OR: [
              { requiredLevel: { lte: user.level } },
              {
                AND: [
                  { minLevel: { lte: user.level } },
                  { maxLevel: { gte: user.level } },
                ],
              },
            ],
          },
          {
            userProgresses: {
              none: {
                userId,
              },
            },
          },
          {
            OR: [
              { questType: QuestType.STANDARD },
              { questType: QuestType.DAILY },
              { questType: QuestType.WEEKLY },
              { 
                AND: [
                  { questType: QuestType.CHAIN },
                  { 
                    OR: [
                      { previousQuestId: null },
                      {
                        previousQuest: {
                          userProgresses: {
                            some: {
                              userId,
                              status: QuestStatus.COMPLETED
                            }
                          }
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      include: {
        objectives: {
          include: {
            targetItem: true,
          },
        },
        rewards: {
          include: {
            item: true,
          },
        },
        zone: true
      },
      orderBy: { requiredLevel: "asc" },
    });

    return quests;
  }

  /**
   * Get active quests for a user with progress information
   */
  async getUserActiveQuests(userId: string): Promise<UserQuestWithProgress[]> {
    // Get user's quest progress entries with ACTIVE status
    const userQuestProgress = await this.db.userQuestProgress.findMany({
      where: {
        userId,
        status: QuestStatus.ACTIVE,
      },
      include: {
        quest: {
          include: {
            objectives: {
              include: {
                targetItem: true,
              },
            },
            rewards: {
              include: {
                item: true,
              },
            },
          },
        },
      },
    });

    // Convert to UserQuestWithProgress format
    return userQuestProgress.map((progress) => {
      // Parse stored progress JSON
      const progressData: Record<string, number> = progress.progress
        ? JSON.parse(progress.progress)
        : {};

      // Map progress to each objective
      const objectiveProgress: QuestObjectiveProgress[] =
        progress.quest.objectives.map((objective) => {
          const currentAmount = progressData[objective.id] || 0;
          return {
            objectiveId: objective.id,
            currentAmount,
            targetAmount: objective.targetAmount,
            completed: currentAmount >= objective.targetAmount,
          };
        });

      return {
        quest: progress.quest,
        status: progress.status,
        progress: objectiveProgress,
      };
    });
  }

  /**
   * Accept a quest for a user
   */
  async acceptQuest(userId: string, questId: string): Promise<boolean> {
    try {
      // Check if the quest exists
      const quest = await this.getQuestById(questId);
      if (!quest) {
        throw new Error(`Quest with ID ${questId} not found`);
      }

      // Check if user meets level requirement
      const user = await this.userService.getUserById(userId);
      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      if (user.level < quest.requiredLevel) {
        throw new Error(
          `This quest requires level ${quest.requiredLevel}. You are level ${user.level}.`
        );
      }

      // Check if user already has this quest
      const existingProgress = await this.db.userQuestProgress.findUnique({
        where: {
          userId_questId: {
            userId,
            questId,
          },
        },
      });

      if (existingProgress) {
        if (existingProgress.status === QuestStatus.COMPLETED) {
          throw new Error("You have already completed this quest.");
        } else {
          throw new Error("You have already accepted this quest.");
        }
      }

      // Initialize progress for all objectives
      const initialProgress: Record<string, number> = {};
      quest.objectives.forEach((objective) => {
        initialProgress[objective.id] = 0;
      });

      // Create user quest progress
      await this.db.userQuestProgress.create({
        data: {
          userId,
          questId,
          status: QuestStatus.ACTIVE,
          progress: JSON.stringify(initialProgress),
        },
      });

      return true;
    } catch (error) {
      console.error("Error accepting quest:", error);
      return false;
    }
  }

  /**
   * Update quest progress based on user actions
   */
  async updateQuestProgress(
    userId: string,
    actionType: string,
    context: Record<string, any>
  ): Promise<void> {
    try {
      // Get user's active quests
      const activeQuestProgresses = await this.db.userQuestProgress.findMany({
        where: {
          userId,
          status: QuestStatus.ACTIVE,
        },
        include: {
          quest: {
            include: {
              objectives: true,
            },
          },
        },
      });

      // No active quests
      if (activeQuestProgresses.length === 0) {
        return;
      }

      // For each active quest, check if any objectives match the action
      for (const questProgress of activeQuestProgresses) {
        let progressUpdated = false;
        const progressData: Record<string, number> = questProgress.progress
          ? JSON.parse(questProgress.progress)
          : {};

        // Check each objective in the quest
        for (const objective of questProgress.quest.objectives) {
          // Skip already completed objectives
          if (progressData[objective.id] >= objective.targetAmount) {
            continue;
          }

          // Check if this objective matches the action type
          if (objective.type === actionType) {
            let increment = 0;

            // Handle different action types
            switch (actionType) {
              case "WORK":
                // Match job-based objectives
                if (objective.targetJobId === context.jobId) {
                  increment = 1;
                }

                // Match item gathering objectives
                if (objective.targetItemId && context.itemsGained) {
                  const gainedItem = context.itemsGained.find(
                    (item: any) => item.item.id === objective.targetItemId
                  );

                  if (gainedItem) {
                    increment = gainedItem.quantity;
                  }
                }
                break;

              case "CRAFT":
                // Match crafting objectives
                if (objective.targetItemId === context.itemId) {
                  increment = context.quantity || 1;
                }
                break;

              case "REACH_LEVEL":
                // Match level objectives
                if (
                  context.newLevel &&
                  context.newLevel >= objective.targetAmount
                ) {
                  increment = 1; // Just mark as complete
                }
                break;

              // Add more action types as needed
            }

            // Update progress if there's an increment
            if (increment > 0) {
              progressData[objective.id] =
                (progressData[objective.id] || 0) + increment;
              progressUpdated = true;
            }
          }
        }

        // If progress was updated, save it
        if (progressUpdated) {
          await this.db.userQuestProgress.update({
            where: { id: questProgress.id },
            data: {
              progress: JSON.stringify(progressData),
            },
          });
        }
      }
    } catch (error) {
      console.error("Error updating quest progress:", error);
    }
  }

  /**
   * Complete a quest and receive rewards
   */
  async completeQuest(
    userId: string,
    questId: string
  ): Promise<QuestCompletionResult> {
    try {
      // Get the quest progress
      const questProgress = await this.db.userQuestProgress.findUnique({
        where: {
          userId_questId: {
            userId,
            questId,
          },
        },
        include: {
          quest: {
            include: {
              objectives: {
                include: {
                  targetItem: true,
                },
              },
              rewards: {
                include: {
                  item: true,
                },
              },
              nextQuest: {
                include: {
                  objectives: {
                    include: {
                      targetItem: true,
                    },
                  },
                  rewards: {
                    include: {
                      item: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!questProgress) {
        return {
          success: false,
          error: "You have not accepted this quest.",
        };
      }

      if (questProgress.status === QuestStatus.COMPLETED) {
        return {
          success: false,
          error: "You have already completed this quest.",
        };
      }

      // Check if all objectives are completed
      const progressData: Record<string, number> = questProgress.progress
        ? JSON.parse(questProgress.progress)
        : {};
      const allObjectivesComplete = questProgress.quest.objectives.every(
        (objective) => {
          return (progressData[objective.id] || 0) >= objective.targetAmount;
        }
      );

      if (!allObjectivesComplete) {
        return {
          success: false,
          quest: questProgress.quest,
          error: "Not all objectives are completed yet.",
        };
      }

      // Use transaction to ensure atomicity for reward distribution
      const rewardsGiven = await this.db.$transaction(async (tx) => {
        const rewards: Array<{
          type: "ITEM" | "CURRENCY" | "EXPERIENCE";
          itemId?: string;
          itemName?: string;
          quantity?: number;
          amount?: number;
        }> = [];

        // Process each reward
        for (const reward of questProgress.quest.rewards) {
          // Item reward
          if (reward.itemId && reward.quantity) {
            await this.inventoryService.addItem(
              userId,
              reward.itemId,
              reward.quantity
            );
            rewards.push({
              type: "ITEM",
              itemId: reward.itemId,
              itemName: reward.item?.name || "Unknown Item",
              quantity: reward.quantity,
            });
          }

          // Currency reward
          if (reward.currency && reward.currency > 0) {
            await this.userService.addCurrency(userId, reward.currency);
            rewards.push({
              type: "CURRENCY",
              amount: reward.currency,
            });
          }

          // Experience reward
          if (reward.experience && reward.experience > 0) {
            await this.userService.addExperience(userId, reward.experience);
            rewards.push({
              type: "EXPERIENCE",
              amount: reward.experience,
            });
          }
        }

        // Update quest status to completed
        await tx.userQuestProgress.update({
          where: { id: questProgress.id },
          data: {
            status: QuestStatus.COMPLETED,
          },
        });

        // Log transaction
        await tx.transaction.create({
          data: {
            senderId: userId,
            receiverId: userId, // Self-transaction for quest
            type: "QUEST_REWARD",
            description: `Completed quest: ${questProgress.quest.name}`,
          },
        });

        return rewards;
      });

      // Process next quest in chain if available
      let nextQuest = undefined;
      if (questProgress.quest.nextQuest) {
        nextQuest = questProgress.quest.nextQuest;
      }

      return {
        success: true,
        quest: questProgress.quest,
        rewards: rewardsGiven,
        nextQuest,
      };
    } catch (error) {
      console.error("Error completing quest:", error);
      return {
        success: false,
        error: `An error occurred: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Abandon a quest
   */
  async abandonQuest(userId: string, questId: string): Promise<boolean> {
    try {
      // Get the quest progress
      const questProgress = await this.db.userQuestProgress.findUnique({
        where: {
          userId_questId: {
            userId,
            questId,
          },
        },
      });

      if (!questProgress) {
        return false; // Quest not found
      }

      if (questProgress.status === QuestStatus.COMPLETED) {
        return false; // Cannot abandon completed quests
      }

      // Delete the quest progress (allowing the user to accept it again in the future)
      await this.db.userQuestProgress.delete({
        where: { id: questProgress.id },
      });

      return true;
    } catch (error) {
      console.error("Error abandoning quest:", error);
      return false;
    }
  }

  /**
   * Create a new quest
   */
  async createQuest(
    name: string,
    description: string,
    requiredLevel: number,
    objectives: Array<{
      type: string;
      targetItemId?: string;
      targetJobId?: string;
      targetAmount: number;
      description: string;
    }>,
    rewards: Array<{
      itemId?: string;
      quantity?: number;
      currency?: number;
      experience?: number;
    }>,
    options?: {
      questType?: QuestType;
      expiresAt?: Date;
      chainId?: string;
      chainOrder?: number;
      zoneId?: string;
      minLevel?: number;
      maxLevel?: number;
      previousQuestId?: string;
    }
  ): Promise<QuestWithDetails> {
    // Create the quest with objectives and rewards
    const quest = await this.db.quest.create({
      data: {
        name,
        description,
        requiredLevel,
        questType: options?.questType || QuestType.STANDARD,
        expiresAt: options?.expiresAt,
        chainId: options?.chainId,
        chainOrder: options?.chainOrder,
        zoneId: options?.zoneId,
        minLevel: options?.minLevel,
        maxLevel: options?.maxLevel,
        previousQuestId: options?.previousQuestId,
        objectives: {
          create: objectives,
        },
        rewards: {
          create: rewards,
        },
      },
      include: {
        objectives: {
          include: {
            targetItem: true,
          },
        },
        rewards: {
          include: {
            item: true,
          },
        },
      },
    });

    return quest;
  }
  
  /**
   * Refresh daily quests
   */
  async refreshDailyQuests(): Promise<void> {
    try {
      const currentDate = new Date();
      
      // Set expiration date for tomorrow
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 1);
      expirationDate.setHours(0, 0, 0, 0);
      
      // Mark all expired daily quests as unavailable by deleting their progress
      await this.db.$transaction([
        // Delete progress for expired daily quests
        this.db.userQuestProgress.deleteMany({
          where: {
            status: {
              not: QuestStatus.COMPLETED,
            },
            quest: {
              questType: QuestType.DAILY,
              expiresAt: {
                lt: currentDate,
              },
            },
          },
        }),
        
        // Update expiration dates for daily quests
        this.db.quest.updateMany({
          where: {
            questType: QuestType.DAILY,
            expiresAt: {
              lt: currentDate,
            },
          },
          data: {
            expiresAt: expirationDate,
          },
        }),
      ]);
    } catch (error) {
      console.error("Error refreshing daily quests:", error);
    }
  }
  
  /**
   * Refresh weekly quests
   */
  async refreshWeeklyQuests(): Promise<void> {
    try {
      const currentDate = new Date();
      
      // Set expiration date for next week
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 7);
      expirationDate.setHours(0, 0, 0, 0);
      
      // Mark all expired weekly quests as unavailable
      await this.db.$transaction([
        // Delete progress for expired weekly quests
        this.db.userQuestProgress.deleteMany({
          where: {
            status: {
              not: QuestStatus.COMPLETED,
            },
            quest: {
              questType: QuestType.WEEKLY,
              expiresAt: {
                lt: currentDate,
              },
            },
          },
        }),
        
        // Update expiration dates for weekly quests
        this.db.quest.updateMany({
          where: {
            questType: QuestType.WEEKLY,
            expiresAt: {
              lt: currentDate,
            },
          },
          data: {
            expiresAt: expirationDate,
          },
        }),
      ]);
    } catch (error) {
      console.error("Error refreshing weekly quests:", error);
    }
  }
  
  /**
   * Get daily quests for a user
   */
  async getDailyQuests(userId: string): Promise<UserQuestWithProgress[]> {
    try {
      const user = await this.userService.getUserById(userId);
      if (!user) {
        return [];
      }
      
      // Get user's active daily quests
      const activeQuestProgresses = await this.db.userQuestProgress.findMany({
        where: {
          userId,
          quest: {
            questType: QuestType.DAILY,
          },
        },
        include: {
          quest: {
            include: {
              objectives: {
                include: {
                  targetItem: true,
                },
              },
              rewards: {
                include: {
                  item: true,
                },
              },
            },
          },
        },
      });
      
      // Convert to UserQuestWithProgress format
      return activeQuestProgresses.map((progress) => {
        // Parse stored progress JSON
        const progressData: Record<string, number> = progress.progress
          ? JSON.parse(progress.progress)
          : {};

        // Map progress to each objective
        const objectiveProgress: QuestObjectiveProgress[] =
          progress.quest.objectives.map((objective) => {
            const currentAmount = progressData[objective.id] || 0;
            return {
              objectiveId: objective.id,
              currentAmount,
              targetAmount: objective.targetAmount,
              completed: currentAmount >= objective.targetAmount,
            };
          });

        return {
          quest: progress.quest,
          status: progress.status,
          progress: objectiveProgress,
        };
      });
    } catch (error) {
      console.error("Error getting daily quests:", error);
      return [];
    }
  }
  
  /**
   * Get weekly quests for a user
   */
  async getWeeklyQuests(userId: string): Promise<UserQuestWithProgress[]> {
    try {
      const user = await this.userService.getUserById(userId);
      if (!user) {
        return [];
      }
      
      // Get user's active weekly quests
      const activeQuestProgresses = await this.db.userQuestProgress.findMany({
        where: {
          userId,
          quest: {
            questType: QuestType.WEEKLY,
          },
        },
        include: {
          quest: {
            include: {
              objectives: {
                include: {
                  targetItem: true,
                },
              },
              rewards: {
                include: {
                  item: true,
                },
              },
            },
          },
        },
      });
      
      // Convert to UserQuestWithProgress format
      return activeQuestProgresses.map((progress) => {
        // Parse stored progress JSON
        const progressData: Record<string, number> = progress.progress
          ? JSON.parse(progress.progress)
          : {};

        // Map progress to each objective
        const objectiveProgress: QuestObjectiveProgress[] =
          progress.quest.objectives.map((objective) => {
            const currentAmount = progressData[objective.id] || 0;
            return {
              objectiveId: objective.id,
              currentAmount,
              targetAmount: objective.targetAmount,
              completed: currentAmount >= objective.targetAmount,
            };
          });

        return {
          quest: progress.quest,
          status: progress.status,
          progress: objectiveProgress,
        };
      });
    } catch (error) {
      console.error("Error getting weekly quests:", error);
      return [];
    }
  }
  
  /**
   * Create a quest chain
   */
  async createQuestChain(
    chainName: string,
    quests: Array<{
      name: string;
      description: string;
      requiredLevel: number;
      objectives: Array<{
        type: string;
        targetItemId?: string;
        targetJobId?: string;
        targetAmount: number;
        description: string;
      }>;
      rewards: Array<{
        itemId?: string;
        quantity?: number;
        currency?: number;
        experience?: number;
      }>;
    }>
  ): Promise<QuestWithDetails[]> {
    try {
      // Generate a unique chain ID
      const chainId = `chain-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      const createdQuests: QuestWithDetails[] = [];
      let previousQuestId: string | null = null;
      
      // Create each quest in the chain
      for (let i = 0; i < quests.length; i++) {
        const questData = quests[i];
        
        // Create the current quest
        const quest = await this.createQuest(
          questData.name,
          questData.description,
          questData.requiredLevel,
          questData.objectives,
          questData.rewards,
          {
            questType: QuestType.CHAIN,
            chainId,
            chainOrder: i,
            previousQuestId: previousQuestId || undefined,
          }
        );
        
        createdQuests.push(quest);
        
        // Update the previous quest with the nextQuestId
        if (previousQuestId) {
          await this.db.quest.update({
            where: { id: previousQuestId },
            data: { nextQuestId: quest.id },
          });
        }
        
        previousQuestId = quest.id;
      }
      
      return createdQuests;
    } catch (error) {
      console.error("Error creating quest chain:", error);
      throw error;
    }
  }
  
  /**
   * Get progress for a quest chain
   */
  async getQuestChainProgress(
    userId: string,
    chainId: string
  ): Promise<{
    chainId: string;
    totalQuests: number;
    completedQuests: number;
    currentQuest?: UserQuestWithProgress;
  }> {
    try {
      // Get all quests in the chain
      const chainQuests = await this.db.quest.findMany({
        where: { chainId },
        orderBy: { chainOrder: 'asc' },
        include: {
          objectives: true,
          rewards: true,
          userProgresses: {
            where: { userId },
          },
        },
      });
      
      if (chainQuests.length === 0) {
        throw new Error(`Quest chain ${chainId} not found`);
      }
      
      // Count completed quests
      const completedQuests = chainQuests.filter(quest => 
        quest.userProgresses.some(progress => progress.status === QuestStatus.COMPLETED)
      ).length;
      
      // Find the current active quest or the next available quest
      let currentQuest: UserQuestWithProgress | undefined = undefined;
      
      for (const quest of chainQuests) {
        if (quest.userProgresses.length > 0 && quest.userProgresses[0].status === QuestStatus.ACTIVE) {
          // This is the active quest
          const progressData = JSON.parse(quest.userProgresses[0].progress || '{}');
          
          const objectiveProgress: QuestObjectiveProgress[] = quest.objectives.map(objective => {
            const currentAmount = progressData[objective.id] || 0;
            return {
              objectiveId: objective.id,
              currentAmount,
              targetAmount: objective.targetAmount,
              completed: currentAmount >= objective.targetAmount,
            };
          });
          
          currentQuest = {
            quest: quest as QuestWithDetails,
            status: quest.userProgresses[0].status,
            progress: objectiveProgress,
          };
          
          break;
        }
        
        if (quest.userProgresses.length === 0) {
          // This is the next available quest
          // Check if the previous quest is completed
          const prevQuestCompleted = quest.previousQuestId === null || 
            chainQuests.some(q => 
              q.id === quest.previousQuestId && 
              q.userProgresses.some(p => p.status === QuestStatus.COMPLETED)
            );
            
          if (prevQuestCompleted) {
            currentQuest = {
              quest: quest as QuestWithDetails,
              status: QuestStatus.AVAILABLE,
              progress: quest.objectives.map(objective => ({
                objectiveId: objective.id,
                currentAmount: 0,
                targetAmount: objective.targetAmount,
                completed: false,
              })),
            };
            
            break;
          }
        }
      }
      
      return {
        chainId,
        totalQuests: chainQuests.length,
        completedQuests,
        currentQuest,
      };
    } catch (error) {
      console.error("Error getting quest chain progress:", error);
      throw error;
    }
  }
  
  /**
   * Adjust quest difficulty based on user level
   */
  adjustQuestForUserLevel(
    quest: QuestWithDetails,
    userLevel: number
  ): QuestWithDetails {
    // Only adjust if quest has min/max level parameters
    if (quest.minLevel === null || quest.maxLevel === null) {
      return quest;
    }
    
    // Clone the quest to avoid modifying the original
    const adjustedQuest = { ...quest, objectives: [...quest.objectives], rewards: [...quest.rewards] };
    
    // Calculate the scaling factor based on user level relative to quest min/max level
    const levelRange = quest.maxLevel - quest.minLevel;
    if (levelRange <= 0) {
      return adjustedQuest;  // Can't scale if no range
    }
    
    const userLevelFactor = Math.min(
      Math.max((userLevel - quest.minLevel) / levelRange, 0),
      1
    );
    
    // Scale objective amounts (harder as level increases)
    adjustedQuest.objectives = quest.objectives.map(objective => {
      const scaleFactor = 1 + (userLevelFactor * 0.5); // 1.0 to 1.5x scaling
      const newTargetAmount = Math.max(
        1,
        Math.round(objective.targetAmount * scaleFactor)
      );
      
      return {
        ...objective,
        targetAmount: newTargetAmount
      };
    });
    
    // Scale rewards (better as level increases)
    adjustedQuest.rewards = quest.rewards.map(reward => {
      const scaleFactor = 1 + (userLevelFactor * 0.75); // 1.0 to 1.75x scaling
      
      return {
        ...reward,
        quantity: reward.quantity ? Math.max(1, Math.round(reward.quantity * scaleFactor)) : reward.quantity,
        currency: reward.currency ? Math.round(reward.currency * scaleFactor) : reward.currency,
        experience: reward.experience ? Math.round(reward.experience * scaleFactor) : reward.experience,
      };
    });
    
    return adjustedQuest;
  }
  
  /**
   * Get quests for a specific zone
   */
  async getQuestsForZone(zoneId: string): Promise<QuestWithDetails[]> {
    try {
      const zone = await this.zoneService.getZoneById(zoneId);
      if (!zone) {
        throw new Error(`Zone ${zoneId} not found`);
      }
      
      const quests = await this.db.quest.findMany({
        where: { zoneId },
        include: {
          objectives: {
            include: {
              targetItem: true,
            },
          },
          rewards: {
            include: {
              item: true,
            },
          },
        },
        orderBy: { requiredLevel: "asc" },
      });
      
      return quests;
    } catch (error) {
      console.error("Error getting quests for zone:", error);
      return [];
    }
  }
  
  /**
   * Get available quests for a user in a specific zone
   */
  async getAvailableQuestsForUserInZone(
    userId: string, 
    zoneId: string
  ): Promise<QuestWithDetails[]> {
    try {
      // Get user information to check level
      const user = await this.userService.getUserById(userId);
      if (!user) {
        return [];
      }
      
      const zone = await this.zoneService.getZoneById(zoneId);
      if (!zone) {
        throw new Error(`Zone ${zoneId} not found`);
      }
      
      const currentDate = new Date();
      
      // Get quests for this zone that match the user level requirement
      const quests = await this.db.quest.findMany({
        where: {
          zoneId,
          OR: [
            { expiresAt: null },
            { expiresAt: { gte: currentDate } },
          ],
          AND: [
            {
              OR: [
                { requiredLevel: { lte: user.level } },
                {
                  AND: [
                    { minLevel: { lte: user.level } },
                    { maxLevel: { gte: user.level } },
                  ],
                },
              ],
            },
            {
              userProgresses: {
                none: {
                  userId,
                  OR: [
                    { status: QuestStatus.ACTIVE },
                    { status: QuestStatus.COMPLETED },
                  ],
                },
              },
            },
          ],
        },
        include: {
          objectives: {
            include: {
              targetItem: true,
            },
          },
          rewards: {
            include: {
              item: true,
            },
          },
        },
        orderBy: { requiredLevel: "asc" },
      });
      
      return quests;
    } catch (error) {
      console.error("Error getting available quests for user in zone:", error);
      return [];
    }
  }
}

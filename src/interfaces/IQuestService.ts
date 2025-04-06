import {
  Quest,
  QuestObjective,
  QuestReward,
  QuestStatus,
  QuestType,
  User,
} from "@prisma/client";

export interface QuestObjectiveProgress {
  objectiveId: string;
  currentAmount: number;
  targetAmount: number;
  completed: boolean;
}

export interface QuestWithDetails extends Quest {
  objectives: QuestObjective[];
  rewards: QuestReward[];
}

export interface UserQuestWithProgress {
  quest: QuestWithDetails;
  status: QuestStatus;
  progress: QuestObjectiveProgress[];
}

export interface QuestCompletionResult {
  success: boolean;
  quest?: QuestWithDetails;
  rewards?: Array<{
    type: "ITEM" | "CURRENCY" | "EXPERIENCE";
    itemId?: string;
    itemName?: string;
    quantity?: number;
    amount?: number;
  }>;
  error?: string;
  nextQuest?: QuestWithDetails; // Added for quest chains
}

export interface IQuestService {
  // Quest retrieval
  getQuestById(questId: string): Promise<QuestWithDetails | null>;
  getAvailableQuestsForUser(userId: string): Promise<QuestWithDetails[]>;
  getUserActiveQuests(userId: string): Promise<UserQuestWithProgress[]>;

  // Quest progression
  acceptQuest(userId: string, questId: string): Promise<boolean>;
  updateQuestProgress(
    userId: string,
    actionType: string,
    context: Record<string, any>
  ): Promise<void>;

  completeQuest(
    userId: string,
    questId: string
  ): Promise<QuestCompletionResult>;
  abandonQuest(userId: string, questId: string): Promise<boolean>;

  // Quest management
  createQuest(
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
    // Added parameters for quest system extensions
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
  ): Promise<QuestWithDetails>;
  
  // New methods for quest system extensions
  
  // Daily/Weekly Quests
  refreshDailyQuests(): Promise<void>;
  refreshWeeklyQuests(): Promise<void>;
  getDailyQuests(userId: string): Promise<UserQuestWithProgress[]>;
  getWeeklyQuests(userId: string): Promise<UserQuestWithProgress[]>;
  
  // Quest Chains
  createQuestChain(
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
  ): Promise<QuestWithDetails[]>;
  
  getQuestChainProgress(
    userId: string,
    chainId: string
  ): Promise<{
    chainId: string;
    totalQuests: number;
    completedQuests: number;
    currentQuest?: UserQuestWithProgress;
  }>;
  
  // Dynamic Difficulty
  adjustQuestForUserLevel(
    quest: QuestWithDetails,
    userLevel: number
  ): QuestWithDetails;
  
  // Location-Based Quests
  getQuestsForZone(zoneId: string): Promise<QuestWithDetails[]>;
  getAvailableQuestsForUserInZone(
    userId: string,
    zoneId: string
  ): Promise<QuestWithDetails[]>;
}

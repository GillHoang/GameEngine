import { User, UserSkill, PrestigePerk, UserPrestigePerk, Title, Badge } from "@prisma/client";
import { MilestoneReward, XpMultiplierEvent } from "../utils/ExperienceCalculator";

export interface UserStats {
  level: number;
  experience: number;
  requiredExperience: number;
  currentEnergy: number;
  maxEnergy: number;
  currency: number;
  // Added for prestige system
  prestigeLevel: number;
  prestigePoints: number;
  totalLifetimeExperience: number;
  activeTitle?: string;
  activeBadge?: string;
}

export interface ExperienceGainResult {
  user: User;
  leveledUp: boolean;
  oldLevel: number;
  newLevel: number;
  baseXp: number;
  actualXp: number;
  multipliers: {
    event: number;
    catchup: number;
    total: number;
  };
  milestoneRewards: MilestoneReward[];
}

export interface PrestigeResult {
  success: boolean;
  user?: User;
  prestigeLevel?: number;
  prestigePoints?: number;
  error?: string;
}

export interface IUserService {
  // User management
  createUser(discordId: string, username: string): Promise<User>;
  getUserByDiscordId(discordId: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
  getUserStats(userId: string): Promise<UserStats>;

  // Currency operations
  addCurrency(userId: string, amount: number): Promise<User>;
  removeCurrency(userId: string, amount: number): Promise<User>;
  transferCurrency(
    senderId: string,
    receiverId: string,
    amount: number
  ): Promise<boolean>;

  // Energy operations
  consumeEnergy(userId: string, amount: number): Promise<User>;
  regenerateEnergy(userId: string, amount: number): Promise<User>;

  // XP and leveling
  addExperience(
    userId: string,
    baseAmount: number,
    zoneId?: string
  ): Promise<ExperienceGainResult>;
  setLevel(userId: string, level: number): Promise<User>;

  // Milestone rewards
  processMilestoneRewards(userId: string, level: number): Promise<MilestoneReward[]>;
  claimMilestoneReward(userId: string, rewardId: string): Promise<boolean>;
  
  // XP event multipliers
  getCurrentXpMultipliers(userId: string): Promise<{
    eventMultiplier: number;
    catchupMultiplier: number;
    totalMultiplier: number;
  }>;
  
  // Zone related
  setCurrentZone(userId: string, zoneId: string): Promise<User>;
  getCurrentZone(userId: string): Promise<string | undefined>;

  // Other operations
  getSkills(userId: string): Promise<UserSkill[]>;
  
  // Analytics and system metrics
  updateAverageUserLevel(): Promise<number>;
  
  // Prestige system
  prestigeUser(userId: string): Promise<PrestigeResult>;
  getPrestigePerks(userId: string): Promise<(UserPrestigePerk & { prestigePerk: PrestigePerk })[]>;
  purchasePrestigePerk(userId: string, perkId: string): Promise<boolean>;
  upgradePrestigePerk(userId: string, userPrestigePerkId: string): Promise<boolean>;
  
  // Titles and Badges
  getUserTitles(userId: string): Promise<Title[]>;
  getUserBadges(userId: string): Promise<Badge[]>;
  setActiveTitle(userId: string, titleId: string | null): Promise<User>;
  setActiveBadge(userId: string, badgeId: string | null): Promise<User>;
  checkEligibleTitles(userId: string): Promise<Title[]>;
  checkEligibleBadges(userId: string): Promise<Badge[]>;
  awardTitle(userId: string, titleId: string): Promise<boolean>;
  awardBadge(userId: string, badgeId: string): Promise<boolean>;
}

import { Skill, UserSkill } from "@prisma/client";

export interface SkillLevelUpResult {
  skill: Skill;
  previousLevel: number;
  newLevel: number;
  userSkill: UserSkill;
}

export interface ISkillService {
  // Skill retrieval
  getSkillById(skillId: string): Promise<Skill | null>;
  getSkillByName(name: string): Promise<Skill | null>;
  getAllSkills(): Promise<Skill[]>;

  // User skill operations
  getUserSkills(userId: string): Promise<UserSkill[]>;
  getUserSkill(userId: string, skillId: string): Promise<(UserSkill & { skill: Skill }) | null>;

  // Skill progression
  addExperience(
    userId: string,
    skillId: string,
    amount: number
  ): Promise<{
    userSkill: UserSkill;
    leveledUp: boolean;
    previousLevel?: number;
    newLevel?: number;
  }>;

  // Skill effects
  calculateJobBonus(
    userId: string,
    jobId: string
  ): Promise<{
    energyReduction: number;
    xpBonus: number;
    dropRateBonus: number;
  }>;

  calculateCraftingBonus(
    userId: string,
    recipeId: string
  ): Promise<{
    energyReduction: number;
    qualityBonus: number;
  }>;

  // Skill management
  createSkill(name: string, description: string): Promise<Skill>;

  // Cache operations
  clearCache(): void;
  refreshCache(): Promise<void>;
}

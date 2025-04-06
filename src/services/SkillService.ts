import { Skill, UserSkill } from "@prisma/client";
import { ISkillService, SkillLevelUpResult } from "../interfaces/ISkillService";
import { DatabaseContext } from "../utils/DatabaseContext";
import { CacheManager } from "../utils/CacheManager";
import { ExperienceCalculator } from "../utils/ExperienceCalculator";

/**
 * Service responsible for skill-related operations
 */
export class SkillService implements ISkillService {
  private db = DatabaseContext.getInstance().getClient();
  private cache: CacheManager<Skill | Skill[]> = new CacheManager<Skill | Skill[]>("skills", 3600);

  // XP multiplier for skill leveling compared to normal leveling
  private readonly SKILL_XP_MULTIPLIER = 0.8;

  /**
   * Get a skill by ID
   */
  async getSkillById(skillId: string): Promise<Skill | null> {
    // Try to get from cache first
    const cachedSkill = this.cache.get(skillId);
    if (cachedSkill && !Array.isArray(cachedSkill)) {
      return cachedSkill;
    }

    // Not in cache, get from database
    const skill = await this.db.skill.findUnique({
      where: { id: skillId },
    });

    // Cache the result if found
    if (skill) {
      this.cache.set(skillId, skill);
      this.cache.set(`name:${skill.name}`, skill);
    }

    return skill;
  }

  /**
   * Get a skill by name
   */
  async getSkillByName(name: string): Promise<Skill | null> {
    // Try to get from cache first
    const cachedSkill = this.cache.get(`name:${name}`);
    if (cachedSkill && !Array.isArray(cachedSkill)) {
      return cachedSkill;
    }

    // Not in cache, get from database
    const skill = await this.db.skill.findUnique({
      where: { name },
    });

    // Cache the result if found
    if (skill) {
      this.cache.set(skill.id, skill);
      this.cache.set(`name:${skill.name}`, skill);
    }

    return skill;
  }

  /**
   * Get all skills
   */
  async getAllSkills(): Promise<Skill[]> {
    // Try to get from cache first
    const cachedSkills = this.cache.get("all");
    if (cachedSkills && Array.isArray(cachedSkills)) {
      return cachedSkills;
    }

    // Not in cache, get from database
    const skills = await this.db.skill.findMany();

    // Cache the results
    this.cache.set("all", skills);

    // Also cache individual skills
    for (const skill of skills) {
      this.cache.set(skill.id, skill);
      this.cache.set(`name:${skill.name}`, skill);
    }

    return skills;
  }

  /**
   * Get all skills for a user
   */
  async getUserSkills(userId: string): Promise<UserSkill[]> {
    return this.db.userSkill.findMany({
      where: { userId },
      include: { skill: true },
    });
  }

  /**
   * Get a specific user skill
   */
  async getUserSkill(
    userId: string,
    skillId: string
  ): Promise<(UserSkill & { skill: Skill }) | null> {
    return this.db.userSkill.findUnique({
      where: {
        userId_skillId: {
          userId,
          skillId,
        },
      },
      include: { skill: true },
    });
  }

  /**
   * Add experience to a user skill
   */
  async addExperience(
    userId: string,
    skillId: string,
    amount: number
  ): Promise<{
    userSkill: UserSkill;
    leveledUp: boolean;
    previousLevel?: number;
    newLevel?: number;
  }> {
    if (amount <= 0) {
      throw new Error("Experience amount must be positive");
    }

    // Get the current user skill
    let userSkill = await this.getUserSkill(userId, skillId);

    // If the user doesn't have this skill yet, create it
    if (!userSkill) {
      userSkill = await this.db.userSkill.create({
        data: {
          userId,
          skillId,
          level: 1,
          experience: 0,
        },
        include: { skill: true },
      });
    }

    const previousLevel = userSkill.level;

    // Apply the skill XP multiplier to make skill leveling different from character leveling
    const scaledAmount = Math.floor(amount * this.SKILL_XP_MULTIPLIER);

    // Calculate the new total experience
    const newExperience = userSkill.experience + scaledAmount;

    // Calculate new level
    const newLevel = ExperienceCalculator.getLevelFromXp(newExperience);

    // Update the user skill
    const updatedUserSkill = await this.db.userSkill.update({
      where: {
        id: userSkill.id,
      },
      data: {
        experience: newExperience,
        level: newLevel,
      },
      include: { skill: true },
    });

    // Check if leveled up
    const leveledUp = newLevel > previousLevel;

    return {
      userSkill: updatedUserSkill,
      leveledUp,
      previousLevel: leveledUp ? previousLevel : undefined,
      newLevel: leveledUp ? newLevel : undefined,
    };
  }

  /**
   * Calculate job bonuses based on user's skill levels
   */
  async calculateJobBonus(
    userId: string,
    jobId: string
  ): Promise<{
    energyReduction: number;
    xpBonus: number;
    dropRateBonus: number;
  }> {
    // Get all user skills
    const userSkills = await this.getUserSkills(userId) as (UserSkill & { skill: Skill })[];

    // Default bonuses
    let energyReduction = 0;
    let xpBonus = 0;
    let dropRateBonus = 0;

    // Get the job to determine which skills affect it
    const job = await this.db.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return { energyReduction, xpBonus, dropRateBonus };
    }

    // For this example, we'll just use a simple system where:
    // - Each skill provides a small bonus based on its level
    // - The bonus is higher if the skill is relevant to the job

    // In a real implementation, you would have a more complex system that maps
    // skills to jobs and defines how they affect each other

    for (const userSkill of userSkills) {
      // Determine the relevance factor (would be job+skill specific in real implementation)
      // Here we're just using the skill name as an example
      const skillName = userSkill.skill.name.toLowerCase();
      const jobName = job.name.toLowerCase();

      // Check if skill is relevant to the job (very simple matching for demo)
      const isRelevant =
        jobName.includes(skillName) || skillName.includes(jobName);
      const relevanceFactor = isRelevant ? 0.03 : 0.01;

      // Apply bonuses based on skill level
      const levelFactor = userSkill.level * relevanceFactor;

      // Apply different bonuses based on skill level
      energyReduction += Math.min(0.5, levelFactor * 0.02); // Max 50% reduction
      xpBonus += Math.min(1.0, levelFactor * 0.05); // Max 100% bonus
      dropRateBonus += Math.min(0.75, levelFactor * 0.03); // Max 75% bonus
    }

    return {
      energyReduction,
      xpBonus,
      dropRateBonus,
    };
  }

  /**
   * Calculate crafting bonuses based on user's skill levels
   */
  async calculateCraftingBonus(
    userId: string,
    recipeId: string
  ): Promise<{
    energyReduction: number;
    qualityBonus: number;
  }> {
    // Get all user skills
    const userSkills = await this.getUserSkills(userId) as (UserSkill & { skill: Skill })[];

    // Default bonuses
    let energyReduction = 0;
    let qualityBonus = 0;

    // Get the recipe to determine which skills affect it
    const recipe = await this.db.craftingRecipe.findUnique({
      where: { id: recipeId },
      include: { resultItem: true },
    });

    if (!recipe) {
      return { energyReduction, qualityBonus };
    }

    // For this example, we'll use a simple system similar to job bonuses

    for (const userSkill of userSkills) {
      // Determine the relevance factor (would be recipe+skill specific in real implementation)
      const skillName = userSkill.skill.name.toLowerCase();
      const itemName = recipe.resultItem.name.toLowerCase();

      // Check if skill is relevant to the crafting (very simple matching for demo)
      const isRelevant =
        itemName.includes(skillName) || skillName.includes("craft");
      const relevanceFactor = isRelevant ? 0.03 : 0.01;

      // Apply bonuses based on skill level
      const levelFactor = userSkill.level * relevanceFactor;

      // Apply different bonuses
      energyReduction += Math.min(0.5, levelFactor * 0.02); // Max 50% reduction
      qualityBonus += Math.min(0.5, levelFactor * 0.02); // Max 50% quality bonus
    }

    return {
      energyReduction,
      qualityBonus,
    };
  }

  /**
   * Create a new skill
   */
  async createSkill(name: string, description: string): Promise<Skill> {
    const skill = await this.db.skill.create({
      data: {
        name,
        description,
      },
    });

    // Update cache
    this.cache.set(skill.id, skill);
    this.cache.set(`name:${skill.name}`, skill);
    this.cache.delete("all"); // Invalidate the 'all' cache

    return skill;
  }

  /**
   * Clear the skill cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Refresh the skill cache
   */
  async refreshCache(): Promise<void> {
    // Clear existing cache
    this.clearCache();

    // Reload all skills
    const skills = await this.db.skill.findMany();

    // Cache 'all' skills
    this.cache.set("all", skills);

    // Cache individual skills
    for (const skill of skills) {
      this.cache.set(skill.id, skill);
      this.cache.set(`name:${skill.name}`, skill);
    }
  }
}

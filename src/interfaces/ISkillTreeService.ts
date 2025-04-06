import { SkillTree, SkillNode, SkillTreeType, User, UserSkillNode } from "@prisma/client";

export interface SkillNodeWithDetails extends SkillNode {
  userNode?: UserSkillNode;
  childNodes?: SkillNodeWithDetails[];
  parentNodes?: SkillNodeWithDetails[];
  isUnlockable: boolean;
}

export interface SkillTreeWithNodes extends SkillTree {
  nodes: SkillNodeWithDetails[];
}

export interface NodeActivationResult {
  success: boolean;
  message?: string;
  user?: User;
  node?: SkillNodeWithDetails;
  unlockedAbilities?: string[];
}

export interface NodeEffects {
  statBoosts?: {
    [key: string]: number;
  };
  abilities?: string[];
  energyBonus?: number;
  xpBonus?: number;
  skillXpBonus?: number;
  craftingBonus?: number;
  gatheringBonus?: number;
  damageBonus?: number;
}

export interface ISkillTreeService {
  // Skill tree management
  createSkillTree(name: string, type: SkillTreeType, description: string): Promise<SkillTree>;
  createSkillNode(
    skillTreeId: string,
    name: string,
    description: string,
    xPosition: number,
    yPosition: number,
    requiredPoints: number,
    requiredLevel: number,
    effect: NodeEffects,
    parentNodeIds?: string[]
  ): Promise<SkillNode>;
  
  // User interactions with skill trees
  getUserSkillTrees(userId: string): Promise<SkillTreeWithNodes[]>;
  activateNode(userId: string, nodeId: string): Promise<NodeActivationResult>;
  resetSkillTree(userId: string, skillTreeId: string): Promise<boolean>;
  
  // Node effect calculations
  calculateUserEffects(userId: string): Promise<{
    statBoosts: { [key: string]: number };
    abilities: string[];
    energyBonus: number;
    xpBonus: number;
    skillXpBonus: number;
    craftingBonus: number;
    gatheringBonus: number;
    damageBonus: number;
  }>;
  
  // Helper functions
  getAvailableSkillPoints(userId: string, skillTreeType: SkillTreeType): Promise<number>;
  getSpentSkillPoints(userId: string, skillTreeId: string): Promise<number>;
}
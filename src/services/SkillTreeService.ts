import { SkillNode, SkillTree, SkillTreeType, User, UserSkillNode } from "@prisma/client";
import {
  ISkillTreeService,
  NodeActivationResult,
  NodeEffects,
  SkillNodeWithDetails,
  SkillTreeWithNodes,
} from "../interfaces/ISkillTreeService";
import { DatabaseContext } from "../utils/DatabaseContext";
import { UserService } from "./UserService";
import { CacheManager } from "../utils/CacheManager";

/**
 * Service responsible for managing skill trees and user skill progression
 */
export class SkillTreeService implements ISkillTreeService {
  private db = DatabaseContext.getInstance().getClient();
  private userService: UserService;
  private skillTreeCache: CacheManager<Record<string, SkillTreeWithNodes[]>>;
  private userEffectsCache: CacheManager<Record<string, {
    statBoosts: Record<string, number>;
    abilities: string[];
    energyBonus: number;
    xpBonus: number;
    skillXpBonus: number;
    craftingBonus: number;
    gatheringBonus: number;
    damageBonus: number;
  }>>;
  
  // Cache keys
  private static readonly SKILL_TREE_CACHE_KEY = "skill_tree";
  private static readonly USER_EFFECTS_CACHE_KEY = "user_effects";
  
  constructor(userService: UserService) {
    this.userService = userService;
    this.skillTreeCache = new CacheManager<Record<string, SkillTreeWithNodes[]>>("skilltree", 3600);
    this.userEffectsCache = new CacheManager<Record<string, {
      statBoosts: Record<string, number>;
      abilities: string[];
      energyBonus: number;
      xpBonus: number;
      skillXpBonus: number;
      craftingBonus: number;
      gatheringBonus: number;
      damageBonus: number;
    }>>("usereffects", 3600);
  }
  
  /**
   * Create a new skill tree
   */
  async createSkillTree(
    name: string,
    type: SkillTreeType,
    description: string
  ): Promise<SkillTree> {
    const skillTree = await this.db.skillTree.create({
      data: {
        name,
        type,
        description,
      },
    });
    
    // Clear cache
    this.skillTreeCache.delete(SkillTreeService.SKILL_TREE_CACHE_KEY);
    
    return skillTree;
  }
  
  /**
   * Create a new skill node in a skill tree
   */
  async createSkillNode(
    skillTreeId: string,
    name: string,
    description: string,
    xPosition: number,
    yPosition: number,
    requiredPoints: number,
    requiredLevel: number,
    effect: NodeEffects,
    parentNodeIds: string[] = []
  ): Promise<SkillNode> {
    // Create the node
    const node = await this.db.skillNode.create({
      data: {
        skillTreeId,
        name,
        description,
        xPosition,
        yPosition,
        requiredPoints,
        requiredLevel,
        effect: JSON.stringify(effect),
      },
    });
    
    // Create dependencies if parent nodes are provided
    if (parentNodeIds.length > 0) {
      await Promise.all(
        parentNodeIds.map(parentNodeId => 
          this.db.skillNodeDependency.create({
            data: {
              parentNodeId,
              childNodeId: node.id,
            },
          })
        )
      );
    }
    
    // Clear cache
    this.skillTreeCache.delete(SkillTreeService.SKILL_TREE_CACHE_KEY);
    
    return node;
  }
  
  /**
   * Get all skill trees with nodes for a user
   */
  async getUserSkillTrees(userId: string): Promise<SkillTreeWithNodes[]> {
    const cacheKey = `${SkillTreeService.SKILL_TREE_CACHE_KEY}:${userId}`;
    const cacheData = this.skillTreeCache.get(cacheKey);
    
    if (cacheData && cacheData[cacheKey]) {
      return cacheData[cacheKey];
    }
    
    // Get user information for level checks
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }
    
    // Get all skill trees
    const skillTrees = await this.db.skillTree.findMany({
      include: {
        nodes: {
          include: {
            parentNodes: {
              include: {
                parentNode: true,
              },
            },
            childNodes: {
              include: {
                childNode: true,
              },
            },
            userNodes: {
              where: {
                userId,
              },
            },
          },
        },
      },
    });
    
    // Transform data to match interface
    const result = await Promise.all(
      skillTrees.map(async (tree) => {
        // Get user's spent points in this tree
        const spentPoints = await this.getSpentSkillPoints(userId, tree.id);
        
        // Transform nodes to include parent/child references and unlockability
        const nodes = tree.nodes.map(node => {
          const userNode = node.userNodes[0];
          
          // Convert parent and child relationships
          const parentNodes = node.parentNodes?.map(dep => {
            const parent = dep.parentNode;
            const parentUserNode = tree.nodes
              .find(n => n.id === parent.id)?.userNodes[0];
            
            return {
              ...parent,
              userNode: parentUserNode,
              isUnlockable: false, // Will be calculated later
              parentNodes: [],
              childNodes: [],
            };
          }) || [];
          
          const childNodes = node.childNodes?.map(dep => {
            const child = dep.childNode;
            const childUserNode = tree.nodes
              .find(n => n.id === child.id)?.userNodes[0];
            
            return {
              ...child,
              userNode: childUserNode,
              isUnlockable: false, // Will be calculated later
              parentNodes: [],
              childNodes: [],
            };
          }) || [];
          
          return {
            ...node,
            userNode,
            parentNodes,
            childNodes,
            isUnlockable: false, // Will be calculated later
          } as SkillNodeWithDetails;
        });
        
        // Calculate which nodes are unlockable
        const processedNodes = nodes.map(node => {
          // Root nodes (no parents) are unlockable if user level is high enough
          let isUnlockable = false;
          
          if ((node.parentNodes?.length || 0) === 0) {
            isUnlockable = user.level >= node.requiredLevel && 
                          spentPoints >= node.requiredPoints &&
                          !node.userNode;
          } else {
            // Non-root nodes require all parent nodes to be activated
            const allParentsActivated = node.parentNodes?.every(
              parent => parent.userNode && parent.userNode.level > 0
            ) || false;
            
            isUnlockable = user.level >= node.requiredLevel && 
                          spentPoints >= node.requiredPoints &&
                          allParentsActivated &&
                          !node.userNode;
          }
          
          return {
            ...node,
            isUnlockable,
          };
        });
        
        return {
          ...tree,
          nodes: processedNodes,
        } as SkillTreeWithNodes;
      })
    );
    
    // Cache the result
    this.skillTreeCache.set(cacheKey, { [cacheKey]: result }, 60 * 10); // Cache for 10 minutes
    
    return result;
  }
  
  /**
   * Activate a skill node for a user
   */
  async activateNode(userId: string, nodeId: string): Promise<NodeActivationResult> {
    try {
      // Get the node details
      const node = await this.db.skillNode.findUnique({
        where: { id: nodeId },
        include: {
          parentNodes: {
            include: {
              parentNode: true,
            },
          },
          userNodes: {
            where: { userId },
          },
        },
      });
      
      if (!node) {
        return { 
          success: false,
          message: `Skill node with ID ${nodeId} not found` 
        };
      }
      
      // Check if node is already activated
      if (node.userNodes.length > 0) {
        return {
          success: false,
          message: "You have already activated this skill node"
        };
      }
      
      // Get user and check level requirement
      const user = await this.userService.getUserById(userId);
      if (!user) {
        return { 
          success: false,
          message: `User with ID ${userId} not found` 
        };
      }
      
      if (user.level < node.requiredLevel) {
        return {
          success: false,
          message: `This skill node requires level ${node.requiredLevel}. You are level ${user.level}.`
        };
      }
      
      // Check spent points requirement
      const spentPoints = await this.getSpentSkillPoints(userId, node.skillTreeId);
      if (spentPoints < node.requiredPoints) {
        return {
          success: false,
          message: `This skill node requires ${node.requiredPoints} points spent in this tree. You've spent ${spentPoints}.`
        };
      }
      
      // Check if all parent nodes are activated
      if ((node.parentNodes?.length || 0) > 0) {
        const parentNodeIds = (node.parentNodes || []).map(dep => dep.parentNode.id);
        
        const activatedParents = await this.db.userSkillNode.count({
          where: {
            userId,
            skillNodeId: {
              in: parentNodeIds
            },
          },
        });
        
        if (activatedParents < parentNodeIds.length) {
          return {
            success: false,
            message: "You must activate all prerequisite skills first"
          };
        }
      }
      
      // All checks passed, activate the node
      const userNode = await this.db.userSkillNode.create({
        data: {
          userId,
          skillNodeId: nodeId,
          level: 1,
        },
      });
      
      // Parse node effects
      let unlockedAbilities: string[] = [];
      try {
        const effect = JSON.parse(node.effect) as NodeEffects;
        unlockedAbilities = effect.abilities || [];
      } catch (error) {
        console.error("Error parsing node effect:", error);
      }
      
      // Clear caches
      this.skillTreeCache.delete(`${SkillTreeService.SKILL_TREE_CACHE_KEY}:${userId}`);
      this.userEffectsCache.delete(`${SkillTreeService.USER_EFFECTS_CACHE_KEY}:${userId}`);
      
      return {
        success: true,
        message: `Successfully activated the ${node.name} skill node!`,
        user,
        node: {
          ...node,
          userNode,
          isUnlockable: false,
          childNodes: [],
          parentNodes: (node.parentNodes || []).map(dep => ({
            ...dep.parentNode,
            isUnlockable: false,
            childNodes: [],
            parentNodes: [],
          })),
        },
        unlockedAbilities,
      };
    } catch (error) {
      console.error("Error activating skill node:", error);
      return {
        success: false,
        message: `An error occurred: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
  
  /**
   * Reset a user's skill tree, refunding all spent points
   */
  async resetSkillTree(userId: string, skillTreeId: string): Promise<boolean> {
    try {
      // Get all user nodes for this tree
      const userNodes = await this.db.userSkillNode.findMany({
        where: {
          userId,
          skillNode: {
            skillTreeId,
          },
        },
      });
      
      if (userNodes.length === 0) {
        return true; // Nothing to reset
      }
      
      // Delete all user nodes for this tree
      await this.db.userSkillNode.deleteMany({
        where: {
          userId,
          skillNode: {
            skillTreeId,
          },
        },
      });
      
      // Clear caches
      this.skillTreeCache.delete(`${SkillTreeService.SKILL_TREE_CACHE_KEY}:${userId}`);
      this.userEffectsCache.delete(`${SkillTreeService.USER_EFFECTS_CACHE_KEY}:${userId}`);
      
      return true;
    } catch (error) {
      console.error("Error resetting skill tree:", error);
      return false;
    }
  }
  
  /**
   * Calculate all effects from a user's activated skill nodes
   */
  async calculateUserEffects(userId: string): Promise<{
    statBoosts: Record<string, number>;
    abilities: string[];
    energyBonus: number;
    xpBonus: number;
    skillXpBonus: number;
    craftingBonus: number;
    gatheringBonus: number;
    damageBonus: number;
  }> {
    const cacheKey = `${SkillTreeService.USER_EFFECTS_CACHE_KEY}:${userId}`;
    const cacheData = this.userEffectsCache.get(cacheKey);
    
    if (cacheData && cacheData[cacheKey]) {
      return cacheData[cacheKey];
    }
    
    // Initialize default effects
    const effects = {
      statBoosts: {} as Record<string, number>,
      abilities: [] as string[],
      energyBonus: 0,
      xpBonus: 0,
      skillXpBonus: 0,
      craftingBonus: 0,
      gatheringBonus: 0,
      damageBonus: 0,
    };
    
    // Get all user's activated nodes
    const userNodes = await this.db.userSkillNode.findMany({
      where: { userId },
      include: {
        skillNode: true,
      },
    });
    
    // Combine effects from all nodes
    for (const userNode of userNodes) {
      try {
        const nodeEffect = JSON.parse(userNode.skillNode.effect) as NodeEffects;
        
        // Apply stat boosts
        if (nodeEffect.statBoosts) {
          Object.entries(nodeEffect.statBoosts).forEach(([stat, value]) => {
            effects.statBoosts[stat] = (effects.statBoosts[stat] || 0) + value;
          });
        }
        
        // Collect abilities
        if (nodeEffect.abilities) {
          effects.abilities = [...effects.abilities, ...nodeEffect.abilities];
        }
        
        // Add other bonuses
        if (nodeEffect.energyBonus) {
          effects.energyBonus += nodeEffect.energyBonus;
        }
        
        if (nodeEffect.xpBonus) {
          effects.xpBonus += nodeEffect.xpBonus;
        }
        
        if (nodeEffect.skillXpBonus) {
          effects.skillXpBonus += nodeEffect.skillXpBonus;
        }
        
        if (nodeEffect.craftingBonus) {
          effects.craftingBonus += nodeEffect.craftingBonus;
        }
        
        if (nodeEffect.gatheringBonus) {
          effects.gatheringBonus += nodeEffect.gatheringBonus;
        }
        
        if (nodeEffect.damageBonus) {
          effects.damageBonus += nodeEffect.damageBonus;
        }
      } catch (error) {
        console.error(`Error parsing effects for node ${userNode.skillNodeId}:`, error);
      }
    }
    
    // Remove duplicate abilities
    effects.abilities = [...new Set(effects.abilities)];
    
    // Cache the result
    this.userEffectsCache.set(cacheKey, { [cacheKey]: effects }, 60 * 5); // Cache for 5 minutes
    
    return effects;
  }
  
  /**
   * Get available skill points for a user in a specific tree type
   */
  async getAvailableSkillPoints(userId: string, skillTreeType: SkillTreeType): Promise<number> {
    // Get user
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }
    
    // Get base points from level and prestige level
    let basePoints = Math.floor(user.level / 5); // 1 point every 5 levels
    if (user.prestigeLevel > 0) {
      basePoints += user.prestigeLevel * 2; // 2 bonus points per prestige level
    }
    
    // Get all skill trees of this type
    const skillTrees = await this.db.skillTree.findMany({
      where: { type: skillTreeType },
      select: { id: true },
    });
    
    // Calculate spent points in all trees of this type
    let spentPoints = 0;
    for (const tree of skillTrees) {
      spentPoints += await this.getSpentSkillPoints(userId, tree.id);
    }
    
    // Return available points
    return Math.max(0, basePoints - spentPoints);
  }
  
  /**
   * Get the number of skill points a user has spent in a specific tree
   */
  async getSpentSkillPoints(userId: string, skillTreeId: string): Promise<number> {
    const userNodes = await this.db.userSkillNode.count({
      where: {
        userId,
        skillNode: {
          skillTreeId,
        },
      },
    });
    
    return userNodes;
  }
}
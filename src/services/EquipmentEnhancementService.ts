import { 
  EnhancementType,
  EnhancementMaterial,
  UserEquipmentEnhancement,
  UserItemInstance,
  Item
} from "@prisma/client";
import {
  EnhancementResult,
  EnhancementTypeWithMaterials,
  IEquipmentEnhancementService,
  UserItemWithEnhancement
} from "../interfaces/IEquipmentEnhancementService";
import { DatabaseContext } from "../utils/DatabaseContext";
import { InventoryService } from "./InventoryService";
import { CacheManager } from "../utils/CacheManager";

/**
 * Service responsible for equipment enhancement operations
 */
export class EquipmentEnhancementService implements IEquipmentEnhancementService {
  private db = DatabaseContext.getInstance().getClient();
  private inventoryService: InventoryService;
  private enhancementCache: CacheManager<Record<string, EnhancementTypeWithMaterials[]>>;

  // Cache keys
  private static readonly ENHANCEMENT_TYPES_CACHE_KEY = "enhancement_types";
  
  constructor(inventoryService: InventoryService) {
    this.inventoryService = inventoryService;
    this.enhancementCache = new CacheManager<Record<string, EnhancementTypeWithMaterials[]>>("enhancement", 3600);
  }
  
  /**
   * Create a new enhancement type
   */
  async createEnhancementType(
    name: string,
    description: string,
    statType: string,
    maxLevel: number,
    baseBonus: number,
    bonusPerLevel: number
  ): Promise<EnhancementType> {
    const enhancementType = await this.db.enhancementType.create({
      data: {
        name,
        description,
        statType,
        maxLevel,
        baseBonus,
        bonusPerLevel
      }
    });
    
    // Clear cache
    this.enhancementCache.delete(EquipmentEnhancementService.ENHANCEMENT_TYPES_CACHE_KEY);
    
    return enhancementType;
  }
  
  /**
   * Add material requirements for an enhancement level
   */
  async addEnhancementMaterial(
    enhancementTypeId: string,
    level: number,
    itemId: string,
    quantity: number
  ): Promise<EnhancementMaterial> {
    const material = await this.db.enhancementMaterial.create({
      data: {
        enhancementTypeId,
        level,
        itemId,
        quantity
      }
    });
    
    // Clear cache
    this.enhancementCache.delete(EquipmentEnhancementService.ENHANCEMENT_TYPES_CACHE_KEY);
    
    return material;
  }
  
  /**
   * Get all enhancement types with their material requirements
   */
  async getEnhancementTypes(): Promise<EnhancementTypeWithMaterials[]> {
    const cacheKey = EquipmentEnhancementService.ENHANCEMENT_TYPES_CACHE_KEY;
    const cacheData = this.enhancementCache.get(cacheKey);
    
    if (cacheData && cacheData[cacheKey]) {
      return cacheData[cacheKey];
    }
    
    const enhancementTypes = await this.db.enhancementType.findMany({
      include: {
        requirements: {
          include: {
            item: true
          }
        }
      }
    });
    
    // Cache the result
    this.enhancementCache.set(cacheKey, { [cacheKey]: enhancementTypes }, 60 * 60); // Cache for 1 hour
    
    return enhancementTypes;
  }
  
  /**
   * Get a specific enhancement type by ID
   */
  async getEnhancementType(enhancementTypeId: string): Promise<EnhancementTypeWithMaterials | null> {
    return this.db.enhancementType.findUnique({
      where: { id: enhancementTypeId },
      include: {
        requirements: {
          include: {
            item: true
          }
        }
      }
    });
  }
  
  /**
   * Enhance a user's item
   */
  async enhanceUserItem(
    userId: string,
    userItemInstanceId: string,
    enhancementTypeId: string
  ): Promise<EnhancementResult> {
    try {
      // Check if the item exists and belongs to the user
      const userItem = await this.db.userItemInstance.findUnique({
        where: { id: userItemInstanceId },
        include: { item: true }
      });
      
      if (!userItem) {
        return {
          success: false,
          message: "Item not found"
        };
      }
      
      if (userItem.userId !== userId) {
        return {
          success: false,
          message: "This item does not belong to you"
        };
      }
      
      // Get enhancement type
      const enhancementType = await this.getEnhancementType(enhancementTypeId);
      if (!enhancementType) {
        return {
          success: false,
          message: "Enhancement type not found"
        };
      }
      
      // Check if item already has this enhancement
      const existingEnhancement = await this.db.userEquipmentEnhancement.findUnique({
        where: {
          userItemInstanceId_enhancementTypeId: {
            userItemInstanceId: userItemInstanceId,
            enhancementTypeId: enhancementTypeId
          }
        }
      });
      
      // Determine current level and next level
      const currentLevel = existingEnhancement ? existingEnhancement.level : 0;
      const nextLevel = currentLevel + 1;
      
      // Check if already at max level
      if (nextLevel > enhancementType.maxLevel) {
        return {
          success: false,
          message: `This ${enhancementType.name} enhancement is already at maximum level (${enhancementType.maxLevel})`
        };
      }
      
      // Get materials required for this enhancement level
      const requiredMaterials = enhancementType.requirements.filter(
        material => material.level === nextLevel
      );
      
      // Check if user has all required materials
      const missingMaterials: Array<{
        itemId: string;
        itemName: string;
        required: number;
        available: number;
      }> = [];
      
      for (const material of requiredMaterials) {
        const inventoryAmount = await this.getItemQuantity(
          userId,
          material.itemId
        );
        
        if (inventoryAmount < material.quantity) {
          missingMaterials.push({
            itemId: material.itemId,
            itemName: material.item.name,
            required: material.quantity,
            available: inventoryAmount
          });
        }
      }
      
      if (missingMaterials.length > 0) {
        return {
          success: false,
          message: "You don't have all required materials for this enhancement",
          consumedMaterials: missingMaterials.map(m => ({
            itemId: m.itemId,
            itemName: m.itemName,
            quantity: m.required
          }))
        };
      }
      
      // All checks passed, perform the enhancement
      const consumedMaterials: Array<{
        itemId: string;
        itemName: string;
        quantity: number;
      }> = [];
      
      // Use transaction to ensure atomicity
      const enhancement = await this.db.$transaction(async (tx) => {
        // Consume materials
        for (const material of requiredMaterials) {
          await this.removeItem(
            userId,
            material.itemId,
            material.quantity
          );
          
          consumedMaterials.push({
            itemId: material.itemId,
            itemName: material.item.name,
            quantity: material.quantity
          });
        }
        
        // Create or update the enhancement
        if (existingEnhancement) {
          return tx.userEquipmentEnhancement.update({
            where: { id: existingEnhancement.id },
            data: { level: nextLevel }
          });
        } else {
          return tx.userEquipmentEnhancement.create({
            data: {
              userId,
              userItemInstanceId,
              enhancementTypeId,
              level: nextLevel
            }
          });
        }
      });
      
      // Calculate the stat bonus
      const baseBonus = enhancementType.baseBonus;
      const levelBonus = enhancementType.bonusPerLevel * nextLevel;
      const totalBonus = baseBonus + levelBonus;
      
      return {
        success: true,
        message: `Successfully enhanced ${userItem.item.name} with ${enhancementType.name} to level ${nextLevel}!`,
        enhancement,
        previousLevel: currentLevel,
        newLevel: nextLevel,
        statBonus: {
          type: enhancementType.statType,
          value: totalBonus
        },
        consumedMaterials
      };
    } catch (error) {
      console.error("Error enhancing item:", error);
      return {
        success: false,
        message: `An error occurred: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
  
  /**
   * Helper method to get item quantity from inventory
   */
  private async getItemQuantity(userId: string, itemId: string): Promise<number> {
    const inventorySlot = await this.db.inventorySlot.findUnique({
      where: {
        userId_itemId: {
          userId,
          itemId
        }
      }
    });
    
    return inventorySlot?.quantity || 0;
  }
  
  /**
   * Helper method to remove items from inventory
   */
  private async removeItem(userId: string, itemId: string, quantity: number): Promise<void> {
    const inventorySlot = await this.db.inventorySlot.findUnique({
      where: {
        userId_itemId: {
          userId,
          itemId
        }
      }
    });
    
    if (!inventorySlot || inventorySlot.quantity < quantity) {
      throw new Error(`Not enough items to remove. Required: ${quantity}, Available: ${inventorySlot?.quantity || 0}`);
    }
    
    const newQuantity = inventorySlot.quantity - quantity;
    
    if (newQuantity <= 0) {
      await this.db.inventorySlot.delete({
        where: {
          id: inventorySlot.id
        }
      });
    } else {
      await this.db.inventorySlot.update({
        where: {
          id: inventorySlot.id
        },
        data: {
          quantity: newQuantity
        }
      });
    }
  }
  
  /**
   * Get all enhanced items for a user
   */
  async getUserEnhancedItems(userId: string): Promise<UserItemWithEnhancement[]> {
    const items = await this.db.userItemInstance.findMany({
      where: {
        userId,
        enhancements: {
          isNot: null
        }
      },
      include: {
        item: true,
        enhancements: {
          include: {
            enhancementType: true
          }
        }
      }
    });
    
    return items.map(item => ({
      ...item,
      enhancements: item.enhancements
    })) as UserItemWithEnhancement[];
  }
  
  /**
   * Get enhancement details for a specific item
   */
  async getUserItemEnhancement(userItemInstanceId: string): Promise<(UserEquipmentEnhancement & {
    enhancementType: EnhancementType;
  }) | null> {
    return this.db.userEquipmentEnhancement.findUnique({
      where: { userItemInstanceId },
      include: {
        enhancementType: true
      }
    });
  }
  
  /**
   * Calculate the bonus provided by an enhancement
   */
  async calculateEnhancementBonus(
    userItemInstanceId: string,
    statType?: string
  ): Promise<{
    statType: string;
    baseValue: number;
    enhancedValue: number;
    bonusPercent: number;
  }> {
    // Get the enhancement
    const enhancement = await this.db.userEquipmentEnhancement.findUnique({
      where: { userItemInstanceId },
      include: {
        enhancementType: true,
        userItemInstance: {
          include: { item: true }
        }
      }
    });
    
    if (!enhancement) {
      return {
        statType: statType || "UNKNOWN",
        baseValue: 0,
        enhancedValue: 0,
        bonusPercent: 0
      };
    }
    
    // If statType is specified, only calculate for that stat
    if (statType && enhancement.enhancementType.statType !== statType) {
      return {
        statType,
        baseValue: 0,
        enhancedValue: 0,
        bonusPercent: 0
      };
    }
    
    const baseValue = 100; // Base value of 100 represents 100%
    const baseBonus = enhancement.enhancementType.baseBonus;
    const levelBonus = enhancement.enhancementType.bonusPerLevel * enhancement.level;
    const totalBonus = baseBonus + levelBonus;
    const enhancedValue = baseValue + totalBonus;
    
    return {
      statType: enhancement.enhancementType.statType,
      baseValue,
      enhancedValue,
      bonusPercent: totalBonus
    };
  }
  
  /**
   * Check if a user can enhance an item
   */
  async canEnhanceItem(
    userId: string,
    userItemInstanceId: string,
    enhancementTypeId: string
  ): Promise<{
    canEnhance: boolean;
    missingRequirements?: Array<{
      itemId: string;
      itemName: string;
      required: number;
      available: number;
    }>;
    atMaxLevel?: boolean;
    currentLevel?: number;
    maxLevel?: number;
  }> {
    try {
      // Check if the item exists and belongs to the user
      const userItem = await this.db.userItemInstance.findUnique({
        where: { id: userItemInstanceId },
        include: { item: true }
      });
      
      if (!userItem || userItem.userId !== userId) {
        return { canEnhance: false };
      }
      
      // Get enhancement type
      const enhancementType = await this.getEnhancementType(enhancementTypeId);
      if (!enhancementType) {
        return { canEnhance: false };
      }
      
      // Check if item already has this enhancement
      const existingEnhancement = await this.db.userEquipmentEnhancement.findUnique({
        where: {
          userItemInstanceId_enhancementTypeId: {
            userItemInstanceId,
            enhancementTypeId
          }
        }
      });
      
      // Determine current level and next level
      const currentLevel = existingEnhancement ? existingEnhancement.level : 0;
      const nextLevel = currentLevel + 1;
      
      // Check if already at max level
      if (nextLevel > enhancementType.maxLevel) {
        return {
          canEnhance: false,
          atMaxLevel: true,
          currentLevel,
          maxLevel: enhancementType.maxLevel
        };
      }
      
      // Get materials required for this enhancement level
      const requiredMaterials = enhancementType.requirements.filter(
        material => material.level === nextLevel
      );
      
      // Check if user has all required materials
      const missingMaterials: Array<{
        itemId: string;
        itemName: string;
        required: number;
        available: number;
      }> = [];
      
      for (const material of requiredMaterials) {
        const inventoryAmount = await this.getItemQuantity(
          userId,
          material.itemId
        );
        
        if (inventoryAmount < material.quantity) {
          missingMaterials.push({
            itemId: material.itemId,
            itemName: material.item.name,
            required: material.quantity,
            available: inventoryAmount
          });
        }
      }
      
      return {
        canEnhance: missingMaterials.length === 0,
        missingRequirements: missingMaterials.length > 0 ? missingMaterials : undefined,
        currentLevel,
        maxLevel: enhancementType.maxLevel
      };
    } catch (error) {
      console.error("Error checking enhancement eligibility:", error);
      return { canEnhance: false };
    }
  }
}
import { EnhancementType, EnhancementMaterial, UserEquipmentEnhancement, UserItemInstance, Item } from "@prisma/client";

export interface EnhancementTypeWithMaterials extends EnhancementType {
  requirements: (EnhancementMaterial & { item: Item })[];
}

export interface EnhancementResult {
  success: boolean;
  message?: string;
  enhancement?: UserEquipmentEnhancement;
  previousLevel?: number;
  newLevel?: number;
  statBonus?: {
    type: string;
    value: number;
  };
  consumedMaterials?: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
  }>;
}

export interface UserItemWithEnhancement extends UserItemInstance {
  item: Item;
  enhancements?: UserEquipmentEnhancement & {
    enhancementType: EnhancementType;
  };
}

export interface IEquipmentEnhancementService {
  // Enhancement type management
  createEnhancementType(
    name: string,
    description: string,
    statType: string,
    maxLevel: number,
    baseBonus: number,
    bonusPerLevel: number
  ): Promise<EnhancementType>;
  
  addEnhancementMaterial(
    enhancementTypeId: string,
    level: number,
    itemId: string,
    quantity: number
  ): Promise<EnhancementMaterial>;
  
  getEnhancementTypes(): Promise<EnhancementTypeWithMaterials[]>;
  getEnhancementType(enhancementTypeId: string): Promise<EnhancementTypeWithMaterials | null>;
  
  // User equipment enhancement operations
  enhanceUserItem(
    userId: string,
    userItemInstanceId: string,
    enhancementTypeId: string
  ): Promise<EnhancementResult>;
  
  getUserEnhancedItems(userId: string): Promise<UserItemWithEnhancement[]>;
  getUserItemEnhancement(userItemInstanceId: string): Promise<(UserEquipmentEnhancement & {
    enhancementType: EnhancementType;
  }) | null>;
  
  // Calculate enhancement effects
  calculateEnhancementBonus(
    userItemInstanceId: string,
    statType?: string
  ): Promise<{
    statType: string;
    baseValue: number;
    enhancedValue: number;
    bonusPercent: number;
  }>;
  
  // Check enhancement requirements
  canEnhanceItem(
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
  }>;
}
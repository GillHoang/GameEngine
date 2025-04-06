import { CraftingRecipe, Item, CraftingSpecialization } from "@prisma/client";

export interface CraftingMaterial {
  item: Item;
  quantity: number;
}

export interface RecipeWithDetails extends CraftingRecipe {
  resultItem: Item;
  materials: CraftingMaterial[];
}

export interface CraftingResult {
  success: boolean;
  recipe: RecipeWithDetails;
  itemsConsumed?: CraftingMaterial[];
  resultItem?: Item;
  resultQuantity?: number;
  energyConsumed?: number;
  error?: string;
  criticalSuccess?: boolean; // Added for critical success
  bonusQuantity?: number; // Added for critical success
  discoveredRecipe?: RecipeWithDetails; // Added for recipe discovery
}

// Added for specialization bonuses
export interface SpecializationBonuses {
  criticalChanceBonus: number; // Additional % chance for critical success
  energyReductionBonus: number; // % reduction in energy cost
  qualityBonus: number; // % bonus to result quantity
  discoveryChanceBonus: number; // % increase to recipe discovery chance
  salvageBonus: number; // % increase to salvage yield
}

// Added for salvaging
export interface SalvageComponent {
  item: Item;
  minQuantity: number;
  maxQuantity: number;
  probability: number;
}

// Added for salvaging
export interface SalvageResult {
  success: boolean;
  sourceItem: Item;
  components?: Array<{
    item: Item;
    quantity: number;
  }>;
  energyConsumed?: number;
  error?: string;
}

export interface ICraftingService {
  // Recipe operations
  getRecipeById(recipeId: string): Promise<RecipeWithDetails | null>;
  getRecipeByResultItem(itemId: string): Promise<RecipeWithDetails | null>;
  getAllRecipes(): Promise<RecipeWithDetails[]>;
  getAvailableRecipesForUser(userId: string): Promise<RecipeWithDetails[]>;
  
  // Crafting operations
  craft(userId: string, recipeId: string): Promise<CraftingResult>;
  canCraft(userId: string, recipeId: string): Promise<{ canCraft: boolean; reason?: string }>;
  
  // Recipe management
  createRecipe(
    resultItemId: string, 
    resultQuantity: number, 
    materials: Array<{ itemId: string; quantity: number }>,
    requiredLevel: number,
    energyCost: number,
    specialization?: CraftingSpecialization, // Added for specialization
    isDiscoverable?: boolean, // Added for recipe discovery
    baseSuccessRate?: number, // Added for critical success
    criticalChance?: number // Added for critical success
  ): Promise<RecipeWithDetails>;
  
  // Cache operations
  clearCache(): void;
  refreshCache(): Promise<void>;
  
  // Added for Recipe Discovery System
  getDiscoveredRecipesForUser(userId: string): Promise<RecipeWithDetails[]>;
  discoverRecipe(userId: string, itemId: string): Promise<RecipeWithDetails | null>;
  createDiscoverableRecipe(
    resultItemId: string,
    resultQuantity: number,
    materials: Array<{ itemId: string; quantity: number }>,
    requiredLevel: number,
    energyCost: number,
    specialization?: CraftingSpecialization,
    baseSuccessRate?: number,
    criticalChance?: number,
    discoveryItemId?: string,
    discoveryProbability?: number
  ): Promise<RecipeWithDetails>;
  
  // Added for Crafting Specializations
  getUserSpecializations(userId: string): Promise<Array<{
    specialization: CraftingSpecialization;
    level: number;
    experience: number;
  }>>;
  getUserSpecialization(
    userId: string, 
    specialization: CraftingSpecialization
  ): Promise<{ level: number; experience: number } | null>;
  addSpecializationExperience(
    userId: string, 
    specialization: CraftingSpecialization, 
    amount: number
  ): Promise<{ level: number; experience: number }>;
  calculateSpecializationBonuses(
    userId: string, 
    specialization: CraftingSpecialization
  ): Promise<SpecializationBonuses>;
  
  // Added for Item Salvaging
  canSalvage(userId: string, itemId: string, quantity?: number): Promise<{ canSalvage: boolean; reason?: string }>;
  salvage(userId: string, itemId: string, quantity?: number): Promise<SalvageResult>;
  getSalvageComponents(itemId: string): Promise<SalvageComponent[]>;
  addSalvageRecipe(
    sourceItemId: string,
    components: Array<{ 
      componentItemId: string; 
      minQuantity: number; 
      maxQuantity: number;
      probability: number;
    }>
  ): Promise<void>;
}
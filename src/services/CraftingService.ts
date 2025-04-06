import { CraftingRecipe, Item, CraftingSpecialization } from "@prisma/client";
import {
  ICraftingService,
  RecipeWithDetails,
  CraftingResult,
  CraftingMaterial,
  SpecializationBonuses,
  SalvageComponent,
  SalvageResult,
} from "../interfaces/ICraftingService";
import { DatabaseContext } from "../utils/DatabaseContext";
import { CacheManager } from "../utils/CacheManager";
import { InventoryService } from "./InventoryService";
import { UserService } from "./UserService";
import { SkillService } from "./SkillService";
import { ItemService } from "./ItemService";

/**
 * Service responsible for crafting-related operations
 */
export class CraftingService implements ICraftingService {
  private db = DatabaseContext.getInstance().getClient();
  private cache: CacheManager<RecipeWithDetails | RecipeWithDetails[]> =
    new CacheManager<RecipeWithDetails | RecipeWithDetails[]>("recipes", 3600);
  private inventoryService: InventoryService;
  private userService: UserService;
  private skillService: SkillService;
  private itemService: ItemService;

  constructor(
    inventoryService: InventoryService,
    userService: UserService,
    skillService: SkillService,
    itemService: ItemService
  ) {
    this.inventoryService = inventoryService;
    this.userService = userService;
    this.skillService = skillService;
    this.itemService = itemService;
  }

  /**
   * Get a recipe by ID
   */
  async getRecipeById(recipeId: string): Promise<RecipeWithDetails | null> {
    // Try to get from cache first
    const cachedRecipe = this.cache.get(recipeId);
    if (cachedRecipe && !Array.isArray(cachedRecipe)) {
      return cachedRecipe;
    }

    // Not in cache, get from database
    const recipe = await this.db.craftingRecipe.findUnique({
      where: { id: recipeId },
      include: {
        resultItem: true,
        materials: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!recipe) {
      return null;
    }

    // Convert to RecipeWithDetails format
    const recipeWithDetails: RecipeWithDetails = {
      ...recipe,
      materials: recipe.materials.map((material) => ({
        item: material.item,
        quantity: material.quantity,
      })),
    };

    // Cache the result
    this.cache.set(recipeId, recipeWithDetails);
    this.cache.set(`resultItem:${recipe.resultItemId}`, recipeWithDetails);

    return recipeWithDetails;
  }

  /**
   * Get a recipe by result item
   */
  async getRecipeByResultItem(
    itemId: string
  ): Promise<RecipeWithDetails | null> {
    // Try to get from cache first
    const cachedRecipe = this.cache.get(`resultItem:${itemId}`);
    if (cachedRecipe && !Array.isArray(cachedRecipe)) {
      return cachedRecipe;
    }

    // Not in cache, get from database
    const recipe = await this.db.craftingRecipe.findFirst({
      where: { resultItemId: itemId },
      include: {
        resultItem: true,
        materials: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!recipe) {
      return null;
    }

    // Convert to RecipeWithDetails format
    const recipeWithDetails: RecipeWithDetails = {
      ...recipe,
      materials: recipe.materials.map((material) => ({
        item: material.item,
        quantity: material.quantity,
      })),
    };

    // Cache the result
    this.cache.set(recipe.id, recipeWithDetails);
    this.cache.set(`resultItem:${itemId}`, recipeWithDetails);

    return recipeWithDetails;
  }

  /**
   * Get all recipes
   */
  async getAllRecipes(): Promise<RecipeWithDetails[]> {
    // Try to get from cache first
    const cachedRecipes = this.cache.get("all");
    if (cachedRecipes && Array.isArray(cachedRecipes)) {
      return cachedRecipes;
    }

    // Not in cache, get from database
    const recipes = await this.db.craftingRecipe.findMany({
      include: {
        resultItem: true,
        materials: {
          include: {
            item: true,
          },
        },
      },
    });

    // Convert to RecipeWithDetails format
    const recipesWithDetails: RecipeWithDetails[] = recipes.map((recipe) => ({
      ...recipe,
      materials: recipe.materials.map((material) => ({
        item: material.item,
        quantity: material.quantity,
      })),
    }));

    // Cache the results
    this.cache.set("all", recipesWithDetails);

    // Also cache individual recipes
    for (const recipe of recipesWithDetails) {
      this.cache.set(recipe.id, recipe);
      this.cache.set(`resultItem:${recipe.resultItemId}`, recipe);
    }

    return recipesWithDetails;
  }

  /**
   * Get recipes available to a user based on level and discovered recipes
   */
  async getAvailableRecipesForUser(
    userId: string
  ): Promise<RecipeWithDetails[]> {
    // Get user information to check level
    const user = await this.userService.getUserById(userId);
    if (!user) {
      return [];
    }

    // Get all recipes first
    const allRecipes = await this.getAllRecipes();
    
    // Get user's discovered recipes
    const discoveredRecipeIds = await this.db.userDiscoveredRecipe
      .findMany({
        where: { userId },
        select: { recipeId: true },
      })
      .then((records) => records.map((r) => r.recipeId));
    
    // Filter recipes based on user level and discovered status
    return allRecipes.filter((recipe) => {
      // Always show recipes that match the user's level and aren't discoverable
      if (recipe.requiredLevel <= user.level && !recipe.isDiscoverable) {
        return true;
      }
      
      // For discoverable recipes, only show if user has discovered it
      if (recipe.isDiscoverable) {
        return discoveredRecipeIds.includes(recipe.id);
      }
      
      return false;
    });
  }

  /**
   * Check if a user can craft a recipe
   */
  async canCraft(
    userId: string,
    recipeId: string
  ): Promise<{ canCraft: boolean; reason?: string }> {
    // Get recipe details
    const recipe = await this.getRecipeById(recipeId);
    if (!recipe) {
      return { canCraft: false, reason: "Recipe not found" };
    }

    // Get user information to check level
    const user = await this.userService.getUserById(userId);
    if (!user) {
      return { canCraft: false, reason: "User not found" };
    }

    // Check if user meets level requirement
    if (user.level < recipe.requiredLevel) {
      return {
        canCraft: false,
        reason: `This recipe requires level ${recipe.requiredLevel}. You are level ${user.level}.`,
      };
    }

    // Check if recipe is discoverable and user has discovered it
    if (recipe.isDiscoverable) {
      const hasDiscovered = await this.db.userDiscoveredRecipe.findFirst({
        where: {
          userId,
          recipeId,
        },
      });
      
      if (!hasDiscovered) {
        return {
          canCraft: false,
          reason: "You haven't discovered this recipe yet.",
        };
      }
    }

    // Calculate energy cost with specialization bonus
    let energyCost = recipe.energyCost;
    if (recipe.specialization) {
      const specializationBonuses = await this.calculateSpecializationBonuses(
        userId, 
        recipe.specialization
      );
      energyCost = Math.max(1, Math.floor(energyCost * (1 - specializationBonuses.energyReductionBonus)));
    }

    // Check if user has enough energy
    if (user.currentEnergy < energyCost) {
      return {
        canCraft: false,
        reason: `This recipe requires ${energyCost} energy. You have ${user.currentEnergy}.`,
      };
    }

    // Check if user has all required materials
    for (const material of recipe.materials) {
      const hasEnough = await this.inventoryService.hasItem(
        userId,
        material.item.id,
        material.quantity
      );

      if (!hasEnough) {
        return {
          canCraft: false,
          reason: `You don't have enough ${material.item.name}. Need ${material.quantity}.`,
        };
      }
    }

    return { canCraft: true };
  }

  /**
   * Craft an item with potential for critical success
   */
  async craft(userId: string, recipeId: string): Promise<CraftingResult> {
    // Check if user can craft
    const canCraftResult = await this.canCraft(userId, recipeId);

    if (!canCraftResult.canCraft) {
      return {
        success: false,
        recipe: (await this.getRecipeById(recipeId))!,
        error: canCraftResult.reason,
      };
    }

    // Get recipe details
    const recipe = await this.getRecipeById(recipeId);

    if (!recipe) {
      return {
        success: false,
        recipe: {
          id: "",
          resultItemId: "",
          resultQuantity: 0,
          requiredLevel: 0,
          energyCost: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          resultItem: {} as Item,
          materials: [],
          baseSuccessRate: 1.0,
          criticalChance: 0.05,
          isDiscoverable: false,
          specialization: null, // Added the missing specialization field
        },
        error: "Recipe not found",
      };
    }

    try {
      // Calculate specialization bonuses if applicable
      let specializationBonuses: SpecializationBonuses = {
        criticalChanceBonus: 0,
        energyReductionBonus: 0,
        qualityBonus: 0,
        discoveryChanceBonus: 0,
        salvageBonus: 0,
      };
      
      if (recipe.specialization) {
        specializationBonuses = await this.calculateSpecializationBonuses(
          userId,
          recipe.specialization
        );
      }

      // Get skill bonuses from the existing skill system
      const craftingBonuses = await this.skillService.calculateCraftingBonus(
        userId,
        recipeId
      );

      // Calculate adjusted energy cost with both skill and specialization bonuses
      const energyCost = Math.max(
        1,
        Math.floor(recipe.energyCost * (1 - craftingBonuses.energyReduction) * (1 - specializationBonuses.energyReductionBonus))
      );

      // Calculate critical chance with bonuses
      const criticalChance = Math.min(
        0.5, // Cap critical chance at 50%
        recipe.criticalChance + specializationBonuses.criticalChanceBonus
      );
      
      // Determine if this is a critical success
      const isCriticalSuccess = Math.random() < criticalChance;
      
      // Calculate success chance (base rate in recipe)
      const successChance = recipe.baseSuccessRate;
      const isSuccess = Math.random() < successChance;
      
      if (!isSuccess) {
        // Failed craft - consume materials and energy but give no result
        await this.db.$transaction(async (tx) => {
          // Consume energy
          await this.userService.consumeEnergy(userId, energyCost);
          
          // Remove materials from inventory
          for (const material of recipe.materials) {
            await this.inventoryService.removeItem(
              userId,
              material.item.id,
              material.quantity
            );
          }
          
          // Log the transaction
          await tx.transaction.create({
            data: {
              senderId: userId,
              receiverId: userId,
              type: "CRAFT",
              description: `Failed to craft ${recipe.resultItem.name}`,
            },
          });
        });
        
        return {
          success: false,
          recipe,
          energyConsumed: energyCost,
          error: "Crafting failed. Materials were consumed in the process.",
        };
      }

      // Use a transaction to ensure atomicity
      const result = await this.db.$transaction(async (tx) => {
        // Consume energy
        await this.userService.consumeEnergy(userId, energyCost);

        // Remove materials from inventory
        const itemsConsumed: CraftingMaterial[] = [];
        for (const material of recipe.materials) {
          await this.inventoryService.removeItem(
            userId,
            material.item.id,
            material.quantity
          );
          itemsConsumed.push(material);
        }

        // Calculate result quantity with quality bonus from both skill system and specializations
        const baseQuantity = recipe.resultQuantity;
        const skillBonus = Math.floor(baseQuantity * craftingBonuses.qualityBonus);
        const specializationBonus = Math.floor(baseQuantity * specializationBonuses.qualityBonus);
        
        // Calculate critical bonus (50% extra by default)
        const criticalBonus = isCriticalSuccess ? Math.ceil(baseQuantity * 0.5) : 0;
        
        // Total quantity
        const totalQuantity = baseQuantity + skillBonus + specializationBonus + criticalBonus;

        // Add crafted item to inventory
        await this.inventoryService.addItem(
          userId,
          recipe.resultItemId,
          totalQuantity
        );

        // Log the transaction
        await tx.transaction.create({
          data: {
            senderId: userId,
            receiverId: userId, // Self-transaction for crafting
            type: "CRAFT",
            itemId: recipe.resultItemId,
            quantity: totalQuantity,
            description: `Crafted ${totalQuantity}x ${recipe.resultItem.name}${isCriticalSuccess ? " (Critical Success!)" : ""}`,
          },
        });
        
        // If recipe has specialization, add experience to that specialization
        if (recipe.specialization) {
          // Base XP is recipe level * 10
          const baseXp = recipe.requiredLevel * 10;
          await this.addSpecializationExperience(userId, recipe.specialization, baseXp);
        }

        // Check for recipe discovery chance
        let discoveredRecipe: RecipeWithDetails | undefined = undefined;
        
        try {
          // Check if there's any discoverable recipe associated with this one
          if (recipe.specialization) {
            const discoveryChance = 0.05 + specializationBonuses.discoveryChanceBonus;
            if (Math.random() < discoveryChance) {
              // Look for a random discoverable recipe of the same specialization that user hasn't discovered yet
              const discoverableRecipe = await tx.craftingRecipe.findFirst({
                where: {
                  isDiscoverable: true,
                  specialization: recipe.specialization,
                  requiredLevel: {
                    lte: Math.min(recipe.requiredLevel + 5, 100) // Up to 5 levels higher or max level
                  },
                  userDiscoveries: {
                    none: {
                      userId
                    }
                  }
                },
                include: {
                  resultItem: true,
                  materials: {
                    include: {
                      item: true,
                    },
                  },
                },
                orderBy: {
                  requiredLevel: 'asc'
                }
              });
              
              if (discoverableRecipe) {
                // Mark as discovered
                await tx.userDiscoveredRecipe.create({
                  data: {
                    userId,
                    recipeId: discoverableRecipe.id
                  }
                });
                
                // Add to result
                discoveredRecipe = {
                  ...discoverableRecipe,
                  materials: discoverableRecipe.materials.map((material) => ({
                    item: material.item,
                    quantity: material.quantity,
                  })),
                };
              }
            }
          }
        } catch (error) {
          console.error("Error checking for recipe discovery:", error);
          // Don't fail the whole crafting process due to discovery error
        }

        return {
          success: true,
          recipe,
          itemsConsumed,
          resultItem: recipe.resultItem,
          resultQuantity: totalQuantity,
          energyConsumed: energyCost,
          criticalSuccess: isCriticalSuccess,
          bonusQuantity: criticalBonus,
          discoveredRecipe
        };
      });

      return result;
    } catch (error) {
      console.error("Error crafting item:", error);
      return {
        success: false,
        recipe,
        error: `An error occurred: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Create a new recipe
   */
  async createRecipe(
    resultItemId: string,
    resultQuantity: number,
    materials: Array<{ itemId: string; quantity: number }>,
    requiredLevel: number,
    energyCost: number,
    specialization?: CraftingSpecialization,
    isDiscoverable?: boolean,
    baseSuccessRate?: number,
    criticalChance?: number
  ): Promise<RecipeWithDetails> {
    // Check if result item exists
    const resultItem = await this.itemService.getItemById(resultItemId);
    if (!resultItem) {
      throw new Error(`Item with ID ${resultItemId} not found`);
    }

    // Create the recipe
    const recipe = await this.db.craftingRecipe.create({
      data: {
        resultItemId,
        resultQuantity,
        requiredLevel,
        energyCost,
        specialization,
        isDiscoverable: isDiscoverable ?? false,
        baseSuccessRate: baseSuccessRate ?? 1.0,
        criticalChance: criticalChance ?? 0.05,
        materials: {
          create: materials.map((material) => ({
            itemId: material.itemId,
            quantity: material.quantity,
          })),
        },
      },
    });

    // Get the complete recipe with details
    const fullRecipe = await this.getRecipeById(recipe.id);

    if (!fullRecipe) {
      throw new Error("Failed to retrieve newly created recipe");
    }

    // Invalidate cache
    this.cache.delete("all");

    return fullRecipe;
  }

  /**
   * Create a discoverable recipe with an associated item for discovery
   */
  async createDiscoverableRecipe(
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
  ): Promise<RecipeWithDetails> {
    // Create the base recipe as discoverable
    const recipe = await this.createRecipe(
      resultItemId,
      resultQuantity,
      materials,
      requiredLevel,
      energyCost,
      specialization,
      true, // isDiscoverable
      baseSuccessRate,
      criticalChance
    );
    
    // If discovery item is specified, create recipe item link
    if (discoveryItemId) {
      await this.db.recipeItem.create({
        data: {
          recipeId: recipe.id,
          itemId: discoveryItemId,
          probability: discoveryProbability ?? 0.1,
        },
      });
      
      // Refresh the recipe to include the new association
      return await this.getRecipeById(recipe.id) as RecipeWithDetails;
    }
    
    return recipe;
  }
  
  /**
   * Get all recipes discovered by a user
   */
  async getDiscoveredRecipesForUser(
    userId: string
  ): Promise<RecipeWithDetails[]> {
    // Get all recipes the user has discovered
    const discoveredRecipes = await this.db.userDiscoveredRecipe.findMany({
      where: { userId },
      include: {
        recipe: {
          include: {
            resultItem: true,
            materials: {
              include: {
                item: true,
              },
            },
          },
        },
      },
    });

    // Convert to RecipeWithDetails format
    return discoveredRecipes.map((discovered) => ({
      ...discovered.recipe,
      materials: discovered.recipe.materials.map((material) => ({
        item: material.item,
        quantity: material.quantity,
      })),
    }));
  }
  
  /**
   * Try to discover a recipe using a specific item
   */
  async discoverRecipe(
    userId: string, 
    itemId: string
  ): Promise<RecipeWithDetails | null> {
    // Find recipes that can be discovered using this item
    const recipeItems = await this.db.recipeItem.findMany({
      where: { 
        itemId,
        recipe: {
          isDiscoverable: true,
        }
      },
      include: {
        recipe: {
          include: {
            resultItem: true,
            materials: {
              include: {
                item: true,
              },
            },
          },
        },
      },
    });
    
    if (recipeItems.length === 0) {
      return null;
    }
    
    // Check if user has already discovered any of these recipes
    const alreadyDiscovered = await this.db.userDiscoveredRecipe.findMany({
      where: {
        userId,
        recipeId: {
          in: recipeItems.map(ri => ri.recipeId)
        }
      },
    });
    
    const discoveredIds = new Set(alreadyDiscovered.map(d => d.recipeId));
    
    // Filter to recipes not yet discovered
    const undiscoveredRecipes = recipeItems.filter(ri => !discoveredIds.has(ri.recipeId));
    
    if (undiscoveredRecipes.length === 0) {
      return null;
    }
    
    // Calculate probabilities for each recipe
    let totalProbability = 0;
    const recipeWithProbabilities = undiscoveredRecipes.map(ri => {
      totalProbability += ri.probability;
      return {
        recipe: ri.recipe,
        probability: ri.probability
      };
    });
    
    // Normalize probabilities
    const normalizedProbabilities = recipeWithProbabilities.map(rwp => ({
      ...rwp,
      normalizedProb: rwp.probability / totalProbability
    }));
    
    // Random roll
    const roll = Math.random();
    let cumulativeProbability = 0;
    
    for (const recipeProb of normalizedProbabilities) {
      cumulativeProbability += recipeProb.normalizedProb;
      if (roll <= cumulativeProbability) {
        // This is the discovered recipe
        
        // Mark it as discovered
        await this.db.userDiscoveredRecipe.create({
          data: {
            userId,
            recipeId: recipeProb.recipe.id
          }
        });
        
        // Remove the consumed item from inventory (1 unit)
        await this.inventoryService.removeItem(userId, itemId, 1);
        
        // Convert to RecipeWithDetails format and return
        return {
          ...recipeProb.recipe,
          materials: recipeProb.recipe.materials.map((material) => ({
            item: material.item,
            quantity: material.quantity,
          })),
        };
      }
    }
    
    // No discovery (shouldn't happen unless there's a math error)
    return null;
  }
  
  /**
   * Get all specializations for a user
   */
  async getUserSpecializations(userId: string): Promise<Array<{
    specialization: CraftingSpecialization;
    level: number;
    experience: number;
  }>> {
    const specializations = await this.db.userCraftingSpecialization.findMany({
      where: { userId }
    });
    
    return specializations.map(spec => ({
      specialization: spec.specialization,
      level: spec.level,
      experience: spec.experience
    }));
  }
  
  /**
   * Get a specific specialization for a user
   */
  async getUserSpecialization(
    userId: string, 
    specialization: CraftingSpecialization
  ): Promise<{ level: number; experience: number } | null> {
    const spec = await this.db.userCraftingSpecialization.findFirst({
      where: { userId, specialization }
    });
    
    if (!spec) {
      return null;
    }
    
    return {
      level: spec.level,
      experience: spec.experience
    };
  }
  
  /**
   * Add experience to a user's crafting specialization
   */
  async addSpecializationExperience(
    userId: string, 
    specialization: CraftingSpecialization, 
    amount: number
  ): Promise<{ level: number; experience: number }> {
    // Check if user already has this specialization
    let userSpec = await this.db.userCraftingSpecialization.findFirst({
      where: { userId, specialization }
    });
    
    // Calculate experience required for the next level: level * 100
    const getNextLevelXp = (level: number) => level * 100;
    
    if (!userSpec) {
      // Create new specialization at level 1
      userSpec = await this.db.userCraftingSpecialization.create({
        data: {
          userId,
          specialization,
          level: 1,
          experience: amount,
        }
      });
    } else {
      // Add experience to existing specialization
      let newExperience = userSpec.experience + amount;
      let newLevel = userSpec.level;
      
      // Level up as long as experience is enough
      while (newExperience >= getNextLevelXp(newLevel)) {
        newExperience -= getNextLevelXp(newLevel);
        newLevel++;
      }
      
      // Update the specialization
      userSpec = await this.db.userCraftingSpecialization.update({
        where: {
          id: userSpec.id
        },
        data: {
          level: newLevel,
          experience: newExperience
        }
      });
    }
    
    return {
      level: userSpec.level,
      experience: userSpec.experience
    };
  }
  
  /**
   * Calculate bonuses for a user's crafting specialization
   */
  async calculateSpecializationBonuses(
    userId: string, 
    specialization: CraftingSpecialization
  ): Promise<SpecializationBonuses> {
    // Default bonuses (no specialization)
    const defaultBonuses: SpecializationBonuses = {
      criticalChanceBonus: 0,
      energyReductionBonus: 0,
      qualityBonus: 0,
      discoveryChanceBonus: 0,
      salvageBonus: 0,
    };
    
    // Get user's specialization level
    const userSpec = await this.getUserSpecialization(userId, specialization);
    if (!userSpec) {
      return defaultBonuses;
    }
    
    // Calculate bonuses based on level
    // Critical chance: +0.5% per level (max 15%)
    const criticalChanceBonus = Math.min(0.15, userSpec.level * 0.005);
    
    // Energy reduction: +1% per level (max 30%)
    const energyReductionBonus = Math.min(0.3, userSpec.level * 0.01);
    
    // Quality bonus: +1% per level (max 25%)
    const qualityBonus = Math.min(0.25, userSpec.level * 0.01);
    
    // Discovery chance: +1% per level (max 20%)
    const discoveryChanceBonus = Math.min(0.2, userSpec.level * 0.01);
    
    // Salvage bonus: +1% per level (max 25%)
    const salvageBonus = Math.min(0.25, userSpec.level * 0.01);
    
    return {
      criticalChanceBonus,
      energyReductionBonus,
      qualityBonus,
      discoveryChanceBonus,
      salvageBonus,
    };
  }
  
  /**
   * Check if an item can be salvaged
   */
  async canSalvage(
    userId: string,
    itemId: string,
    quantity: number = 1
  ): Promise<{ canSalvage: boolean; reason?: string }> {
    // Check if user has the item
    const hasItem = await this.inventoryService.hasItem(userId, itemId, quantity);
    if (!hasItem) {
      return {
        canSalvage: false,
        reason: `You don't have ${quantity} of this item to salvage.`
      };
    }
    
    // Check if the item has salvage components defined
    const salvageComponents = await this.getSalvageComponents(itemId);
    if (salvageComponents.length === 0) {
      return {
        canSalvage: false,
        reason: "This item cannot be salvaged."
      };
    }
    
    // Check if user has enough energy (1 energy per item)
    const user = await this.userService.getUserById(userId);
    if (!user || user.currentEnergy < quantity) {
      return {
        canSalvage: false,
        reason: `You don't have enough energy to salvage ${quantity} items. Need ${quantity} energy.`
      };
    }
    
    return { canSalvage: true };
  }
  
  /**
   * Salvage an item into its components
   */
  async salvage(
    userId: string,
    itemId: string,
    quantity: number = 1
  ): Promise<SalvageResult> {
    // Check if user can salvage
    const canSalvageResult = await this.canSalvage(userId, itemId, quantity);
    if (!canSalvageResult.canSalvage) {
      return {
        success: false,
        sourceItem: await this.itemService.getItemById(itemId) as Item,
        error: canSalvageResult.reason,
      };
    }
    
    // Get item details
    const item = await this.itemService.getItemById(itemId);
    if (!item) {
      return {
        success: false,
        sourceItem: {} as Item,
        error: "Item not found",
      };
    }
    
    // Get salvage components
    const salvageComponents = await this.getSalvageComponents(itemId);
    
    try {
      // Get user's specialization bonus for salvaging
      // Check item type to determine which specialization to use
      let salvageSpecialization: CraftingSpecialization | undefined;
      
      switch (item.type) {
        case "CRAFTED":
          if (item.name.toLowerCase().includes("weapon")) {
            salvageSpecialization = CraftingSpecialization.WEAPONSMITH;
          } else if (item.name.toLowerCase().includes("armor")) {
            salvageSpecialization = CraftingSpecialization.ARMORSMITH;
          } else if (item.name.toLowerCase().includes("potion")) {
            salvageSpecialization = CraftingSpecialization.ALCHEMY;
          } else if (item.name.toLowerCase().includes("food")) {
            salvageSpecialization = CraftingSpecialization.COOKING;
          } else if (item.name.toLowerCase().includes("jewel")) {
            salvageSpecialization = CraftingSpecialization.JEWELCRAFTING;
          } else if (item.name.toLowerCase().includes("cloth")) {
            salvageSpecialization = CraftingSpecialization.TAILORING;
          } else if (item.name.toLowerCase().includes("gadget")) {
            salvageSpecialization = CraftingSpecialization.ENGINEERING;
          } else if (item.name.toLowerCase().includes("wood")) {
            salvageSpecialization = CraftingSpecialization.WOODWORKING;
          }
          break;
        default:
          // Default to no specialization for non-crafted items
          break;
      }
      
      let salvageBonus = 0;
      if (salvageSpecialization) {
        const specializationBonuses = await this.calculateSpecializationBonuses(
          userId,
          salvageSpecialization
        );
        salvageBonus = specializationBonuses.salvageBonus;
      }
      
      // Process salvaging through a transaction
      return await this.db.$transaction(async (tx) => {
        // Consume energy (1 per item)
        const energyCost = quantity;
        await this.userService.consumeEnergy(userId, energyCost);
        
        // Remove the items from inventory
        await this.inventoryService.removeItem(userId, itemId, quantity);
        
        // Calculate recovered components
        const components: Array<{ item: Item, quantity: number }> = [];
        
        for (const component of salvageComponents) {
          // For each item being salvaged, calculate components
          for (let i = 0; i < quantity; i++) {
            // Check if component is recovered (based on probability)
            if (Math.random() <= (component.probability + salvageBonus)) {
              // Calculate quantity (between min and max)
              let componentQuantity = Math.floor(
                Math.random() * (component.maxQuantity - component.minQuantity + 1) + 
                component.minQuantity
              );
              
              // Apply salvage bonus to quantity (additional 0-100%)
              const bonusAmount = Math.floor(componentQuantity * salvageBonus);
              componentQuantity += bonusAmount;
              
              // Add to inventory
              await this.inventoryService.addItem(userId, component.item.id, componentQuantity);
              
              // Add to result
              const existingItem = components.find(c => c.item.id === component.item.id);
              if (existingItem) {
                existingItem.quantity += componentQuantity;
              } else {
                components.push({ 
                  item: component.item, 
                  quantity: componentQuantity 
                });
              }
            }
          }
        }
        
        // Log the transaction
        await tx.transaction.create({
          data: {
            senderId: userId,
            receiverId: userId,
            type: "SALVAGE",
            itemId: item.id,
            quantity: quantity,
            description: `Salvaged ${quantity}x ${item.name}`,
          },
        });
        
        // If there was a specialization, add experience
        if (salvageSpecialization) {
          const baseXp = Math.max(5, Math.floor(item.baseValue / 10));
          await this.addSpecializationExperience(
            userId,
            salvageSpecialization,
            baseXp * quantity
          );
        }
        
        return {
          success: true,
          sourceItem: item,
          components,
          energyConsumed: energyCost,
        };
      });
    } catch (error) {
      console.error("Error salvaging item:", error);
      return {
        success: false,
        sourceItem: item,
        error: `An error occurred: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }
  
  /**
   * Get components that can be salvaged from an item
   */
  async getSalvageComponents(itemId: string): Promise<SalvageComponent[]> {
    // Get salvage components from database
    const components = await this.db.salvageComponent.findMany({
      where: { sourceItemId: itemId },
      include: {
        componentItem: true,
      },
    });
    
    // Convert to SalvageComponent format
    return components.map(component => ({
      item: component.componentItem,
      minQuantity: component.minQuantity,
      maxQuantity: component.maxQuantity,
      probability: component.probability,
    }));
  }
  
  /**
   * Add or update a salvage recipe
   */
  async addSalvageRecipe(
    sourceItemId: string,
    components: Array<{ 
      componentItemId: string; 
      minQuantity: number; 
      maxQuantity: number;
      probability: number;
    }>
  ): Promise<void> {
    // Check if source item exists
    const sourceItem = await this.itemService.getItemById(sourceItemId);
    if (!sourceItem) {
      throw new Error(`Item with ID ${sourceItemId} not found`);
    }
    
    // Delete any existing components for this item
    await this.db.salvageComponent.deleteMany({
      where: { sourceItemId },
    });
    
    // Add new components
    for (const component of components) {
      // Check if component item exists
      const componentItem = await this.itemService.getItemById(component.componentItemId);
      if (!componentItem) {
        throw new Error(`Component item with ID ${component.componentItemId} not found`);
      }
      
      // Create component
      await this.db.salvageComponent.create({
        data: {
          sourceItemId,
          componentItemId: component.componentItemId,
          minQuantity: component.minQuantity,
          maxQuantity: component.maxQuantity,
          probability: component.probability,
        },
      });
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Refresh the cache
   */
  async refreshCache(): Promise<void> {
    // Clear existing cache
    this.clearCache();

    // Reload all recipes
    await this.getAllRecipes();
  }
}

import { Item, ItemType, ToolSpecification } from '@prisma/client';
import { IItemService, CreateItemDto, CreateToolDto, ItemWithToolSpec } from '../interfaces/IItemService';
import { DatabaseContext } from '../utils/DatabaseContext';
import { CacheManager } from '../utils/CacheManager';

/**
 * Service responsible for item-related operations
 * Uses caching to improve performance for frequently accessed data
 */
export class ItemService implements IItemService {
  private db = DatabaseContext.getInstance().getClient();
  private cache: CacheManager<Item> = new CacheManager<Item>('items', 3600); // 1 hour TTL
  private toolCache: CacheManager<ToolSpecification> = new CacheManager<ToolSpecification>('tools', 3600);
  // Add a separate cache for collections of items
  private collectionCache: CacheManager<Item[]> = new CacheManager<Item[]>('item-collections', 3600);
  
  /**
   * Create a new item
   */
  async createItem(itemData: CreateItemDto): Promise<Item> {
    const item = await this.db.item.create({
      data: itemData
    });
    
    // Update cache with new item
    this.cache.set(item.id, item);
    this.cache.set(`name:${item.name}`, item);
    
    return item;
  }
  
  /**
   * Create a new tool item with specifications
   */
  async createTool(toolData: CreateToolDto): Promise<ItemWithToolSpec> {
    // Create the base item first
    const item = await this.createItem({
      name: toolData.name,
      description: toolData.description,
      type: ItemType.TOOL,
      rarity: toolData.rarity,
      baseValue: toolData.baseValue,
      stackable: false, // Tools are not stackable
      tradable: toolData.tradable
    });
    
    // Create the tool specification
    const toolSpec = await this.db.toolSpecification.create({
      data: {
        itemId: item.id,
        efficiencyBonus: toolData.efficiencyBonus,
        maxDurability: toolData.maxDurability
      }
    });
    
    // Cache the tool specification
    this.toolCache.set(item.id, toolSpec);
    
    return {
      ...item,
      toolSpecifications: toolSpec
    };
  }
  
  /**
   * Get an item by ID, using cache if available
   */
  async getItemById(id: string): Promise<Item | null> {
    // Try to get from cache first
    const cachedItem = this.cache.get(id);
    if (cachedItem) {
      return cachedItem;
    }
    
    // Not in cache, get from database
    const item = await this.db.item.findUnique({
      where: { id }
    });
    
    // Cache the result if found
    if (item) {
      this.cache.set(id, item);
    }
    
    return item;
  }
  
  /**
   * Get an item by name, using cache if available
   */
  async getItemByName(name: string): Promise<Item | null> {
    // Try to get from cache first
    const cachedItem = this.cache.get(`name:${name}`);
    if (cachedItem) {
      return cachedItem;
    }
    
    // Not in cache, get from database
    const item = await this.db.item.findUnique({
      where: { name }
    });
    
    // Cache the result if found
    if (item) {
      this.cache.set(`name:${name}`, item);
      this.cache.set(item.id, item); // Also cache by ID
    }
    
    return item;
  }
  
  /**
   * Get all items (with caching)
   */
  async getAllItems(): Promise<Item[]> {
    // For collection results, use a different cache key
    const collectionCacheKey = 'all-items';
    const cachedItems = this.collectionCache.get(collectionCacheKey);
    
    if (cachedItems && Array.isArray(cachedItems)) {
      return cachedItems;
    }
    
    const items = await this.db.item.findMany();
    
    // Cache the collection
    this.collectionCache.set(collectionCacheKey, items);
    
    // Also cache individual items
    items.forEach(item => {
      this.cache.set(item.id, item);
      this.cache.set(`name:${item.name}`, item);
    });
    
    return items;
  }
  
  /**
   * Get items by type (with caching)
   */
  async getItemsByType(type: ItemType): Promise<Item[]> {
    // Cache key for items by type
    const typeCacheKey = `type:${type}`;
    const cachedItems = this.collectionCache.get(typeCacheKey);
    
    if (cachedItems && Array.isArray(cachedItems)) {
      return cachedItems;
    }
    
    const items = await this.db.item.findMany({
      where: { type }
    });
    
    // Cache the collection by type
    this.collectionCache.set(typeCacheKey, items);
    
    // Also cache individual items
    items.forEach(item => {
      this.cache.set(item.id, item);
      this.cache.set(`name:${item.name}`, item);
    });
    
    return items;
  }
  
  /**
   * Get tool specifications for an item
   */
  async getToolSpecification(itemId: string): Promise<ToolSpecification | null> {
    // Try to get from cache first
    const cachedSpec = this.toolCache.get(itemId);
    if (cachedSpec) {
      return cachedSpec;
    }
    
    // Not in cache, get from database
    const spec = await this.db.toolSpecification.findUnique({
      where: { itemId }
    });
    
    // Cache the result if found
    if (spec) {
      this.toolCache.set(itemId, spec);
    }
    
    return spec;
  }
  
  /**
   * Update tool specifications
   */
  async updateToolSpecification(
    itemId: string,
    data: { efficiencyBonus?: number; maxDurability?: number }
  ): Promise<ToolSpecification> {
    const updatedSpec = await this.db.toolSpecification.update({
      where: { itemId },
      data
    });
    
    // Update cache
    this.toolCache.set(itemId, updatedSpec);
    
    return updatedSpec;
  }
  
  /**
   * Clear all item caches
   */
  clearCache(): void {
    this.cache.clear();
    this.toolCache.clear();
    this.collectionCache.clear();
  }
  
  /**
   * Refresh all item caches by reloading data from the database
   */
  async refreshCache(): Promise<void> {
    // Clear existing caches
    this.clearCache();
    
    // Reload all items
    const items = await this.db.item.findMany();
    
    // Cache all items
    this.collectionCache.set('all-items', items);
    
    // Cache individual items
    items.forEach(item => {
      this.cache.set(item.id, item);
      this.cache.set(`name:${item.name}`, item);
    });
    
    // Group items by type for type-specific caching
    const itemsByType: Record<ItemType, Item[]> = {
      [ItemType.RESOURCE]: [],
      [ItemType.TOOL]: [],
      [ItemType.CONSUMABLE]: [],
      [ItemType.CRAFTED]: []
    };
    
    items.forEach(item => {
      itemsByType[item.type].push(item);
    });
    
    // Cache items by type
    Object.entries(itemsByType).forEach(([type, typeItems]) => {
      this.collectionCache.set(`type:${type}`, typeItems);
    });
    
    // Reload and cache tool specifications
    const tools = await this.db.toolSpecification.findMany();
    tools.forEach(tool => {
      this.toolCache.set(tool.itemId, tool);
    });
  }
}
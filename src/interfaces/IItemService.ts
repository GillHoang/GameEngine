import { Item, ItemType, ToolSpecification } from "@prisma/client";

export interface CreateItemDto {
  name: string;
  description: string;
  type: ItemType;
  rarity: string;
  baseValue: number;
  stackable: boolean;
  tradable: boolean;
}

export interface CreateToolDto extends CreateItemDto {
  efficiencyBonus: number;
  maxDurability: number;
}

export interface ItemWithToolSpec extends Item {
  toolSpecifications: ToolSpecification | null;
}

export interface IItemService {
  // Item operations
  createItem(itemData: CreateItemDto): Promise<Item>;
  createTool(toolData: CreateToolDto): Promise<ItemWithToolSpec>;
  getItemById(id: string): Promise<Item | null>;
  getItemByName(name: string): Promise<Item | null>;
  getAllItems(): Promise<Item[]>;
  getItemsByType(type: ItemType): Promise<Item[]>;

  // Tool-specific operations
  getToolSpecification(itemId: string): Promise<ToolSpecification | null>;
  updateToolSpecification(
    itemId: string,
    data: { efficiencyBonus?: number; maxDurability?: number }
  ): Promise<ToolSpecification>;

  // Cache operations
  clearCache(): void;
  refreshCache(): Promise<void>;
}

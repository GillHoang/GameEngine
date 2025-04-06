import { InventorySlot, UserItemInstance, Item } from "@prisma/client";

export interface InventoryItem {
  item: Item;
  quantity: number;
}

export interface IInventoryService {
  // Regular inventory operations
  addItem(
    userId: string,
    itemId: string,
    quantity: number
  ): Promise<InventorySlot>;
  removeItem(
    userId: string,
    itemId: string,
    quantity: number
  ): Promise<InventorySlot | null>;
  getInventory(userId: string): Promise<InventoryItem[]>;
  getInventoryItem(
    userId: string,
    itemId: string
  ): Promise<InventorySlot | null>;
  hasItem(userId: string, itemId: string, quantity: number): Promise<boolean>;

  // UserItemInstance operations (for non-stackable items like tools)
  createItemInstance(userId: string, itemId: string): Promise<UserItemInstance>;
  getUserItemInstances(
    userId: string,
    itemId?: string
  ): Promise<UserItemInstance[]>;
  getUserItemInstance(instanceId: string): Promise<UserItemInstance | null>;
  updateToolDurability(
    instanceId: string,
    change: number
  ): Promise<UserItemInstance>;
  removeItemInstance(instanceId: string): Promise<boolean>;

  // Transfer operations
  transferItem(
    senderId: string,
    receiverId: string,
    itemId: string,
    quantity: number
  ): Promise<boolean>;
  transferItemInstance(
    senderId: string,
    receiverId: string,
    instanceId: string
  ): Promise<boolean>;
}

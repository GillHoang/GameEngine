import { InventorySlot, UserItemInstance, Item } from '@prisma/client';
import { IInventoryService, InventoryItem } from '../interfaces/IInventoryService';
import { DatabaseContext } from '../utils/DatabaseContext';
import { ItemService } from './ItemService';

/**
 * Service responsible for inventory-related operations
 */
export class InventoryService implements IInventoryService {
  private db = DatabaseContext.getInstance().getClient();
  private itemService: ItemService;
  
  constructor(itemService: ItemService) {
    this.itemService = itemService;
  }
  
  /**
   * Add an item to user's inventory
   */
  async addItem(userId: string, itemId: string, quantity: number): Promise<InventorySlot> {
    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    
    // Get the item to check if it's stackable
    const item = await this.itemService.getItemById(itemId);
    if (!item) {
      throw new Error(`Item with id ${itemId} not found`);
    }
    
    // If the item is not stackable, create individual instances instead
    if (!item.stackable) {
      // Create the specified number of item instances
      for (let i = 0; i < quantity; i++) {
        await this.createItemInstance(userId, itemId);
      }
      
      // Return a virtual inventory slot (not actually in the database for non-stackables)
      return {
        id: 'virtual',
        userId,
        itemId,
        quantity,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
    
    // Try to find existing inventory slot
    const existingSlot = await this.db.inventorySlot.findUnique({
      where: {
        userId_itemId: {
          userId,
          itemId
        }
      }
    });
    
    if (existingSlot) {
      // Update existing slot
      return this.db.inventorySlot.update({
        where: { id: existingSlot.id },
        data: {
          quantity: {
            increment: quantity
          }
        }
      });
    } else {
      // Create new slot
      return this.db.inventorySlot.create({
        data: {
          userId,
          itemId,
          quantity
        }
      });
    }
  }
  
  /**
   * Remove an item from user's inventory
   */
  async removeItem(userId: string, itemId: string, quantity: number): Promise<InventorySlot | null> {
    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    
    // Get the item to check if it's stackable
    const item = await this.itemService.getItemById(itemId);
    if (!item) {
      throw new Error(`Item with id ${itemId} not found`);
    }
    
    // If item is not stackable, remove from user item instances
    if (!item.stackable) {
      // Get the specified number of item instances
      const instances = await this.db.userItemInstance.findMany({
        where: {
          userId,
          itemId
        },
        take: quantity,
      });
      
      if (instances.length < quantity) {
        throw new Error(`User does not have ${quantity} instances of item ${itemId}`);
      }
      
      // Delete the instances
      for (const instance of instances) {
        await this.db.userItemInstance.delete({
          where: { id: instance.id }
        });
      }
      
      // Return null as no inventory slot was affected
      return null;
    }
    
    // For stackable items, update the inventory slot
    const existingSlot = await this.db.inventorySlot.findUnique({
      where: {
        userId_itemId: {
          userId,
          itemId
        }
      }
    });
    
    if (!existingSlot) {
      throw new Error(`User does not have item ${itemId} in inventory`);
    }
    
    if (existingSlot.quantity < quantity) {
      throw new Error(`User only has ${existingSlot.quantity} of item ${itemId}, cannot remove ${quantity}`);
    }
    
    // If removing all, delete the slot
    if (existingSlot.quantity === quantity) {
      await this.db.inventorySlot.delete({
        where: { id: existingSlot.id }
      });
      return null;
    } else {
      // Otherwise, update the quantity
      return this.db.inventorySlot.update({
        where: { id: existingSlot.id },
        data: {
          quantity: {
            decrement: quantity
          }
        }
      });
    }
  }
  
  /**
   * Get user's inventory with item details
   */
  async getInventory(userId: string): Promise<InventoryItem[]> {
    // Get all inventory slots for the user
    const inventorySlots = await this.db.inventorySlot.findMany({
      where: { userId },
      include: {
        item: true
      }
    });
    
    // Convert to InventoryItem format
    const stackableItems = inventorySlots.map(slot => ({
      item: slot.item,
      quantity: slot.quantity
    }));
    
    // Get all item instances for non-stackable items
    const itemInstances = await this.db.userItemInstance.findMany({
      where: { userId },
      include: {
        item: true
      }
    });
    
    // Group instances by item type
    const instancesByItemId: Record<string, { item: Item; quantity: number }> = {};
    
    itemInstances.forEach(instance => {
      const itemId = instance.itemId;
      if (!instancesByItemId[itemId]) {
        instancesByItemId[itemId] = {
          item: instance.item,
          quantity: 0
        };
      }
      instancesByItemId[itemId].quantity++;
    });
    
    // Combine stackable and non-stackable items
    return [
      ...stackableItems,
      ...Object.values(instancesByItemId)
    ];
  }
  
  /**
   * Get a specific item from user's inventory
   */
  async getInventoryItem(userId: string, itemId: string): Promise<InventorySlot | null> {
    return this.db.inventorySlot.findUnique({
      where: {
        userId_itemId: {
          userId,
          itemId
        }
      }
    });
  }
  
  /**
   * Check if user has enough of an item
   */
  async hasItem(userId: string, itemId: string, quantity: number): Promise<boolean> {
    // Get the item to check if it's stackable
    const item = await this.itemService.getItemById(itemId);
    if (!item) {
      return false;
    }
    
    // For stackable items, check inventory slot
    if (item.stackable) {
      const slot = await this.getInventoryItem(userId, itemId);
      return !!slot && slot.quantity >= quantity;
    } else {
      // For non-stackable items, count instances
      const count = await this.db.userItemInstance.count({
        where: {
          userId,
          itemId
        }
      });
      
      return count >= quantity;
    }
  }
  
  /**
   * Create a new instance of an item for a user (for non-stackable items)
   */
  async createItemInstance(userId: string, itemId: string): Promise<UserItemInstance> {
    // Get the item to check if it's a tool (to set durability)
    const item = await this.itemService.getItemById(itemId);
    if (!item) {
      throw new Error(`Item with id ${itemId} not found`);
    }
    
    let durability: number | undefined = undefined;
    
    // If it's a tool, get the max durability from tool specifications
    if (item.type === 'TOOL') {
      const toolSpec = await this.itemService.getToolSpecification(itemId);
      if (toolSpec) {
        durability = toolSpec.maxDurability;
      }
    }
    
    // Create the item instance
    return this.db.userItemInstance.create({
      data: {
        userId,
        itemId,
        durability
      }
    });
  }
  
  /**
   * Get all item instances for a user, optionally filtered by item type
   */
  async getUserItemInstances(userId: string, itemId?: string): Promise<UserItemInstance[]> {
    return this.db.userItemInstance.findMany({
      where: {
        userId,
        ...(itemId ? { itemId } : {})
      },
      include: {
        item: true
      }
    });
  }
  
  /**
   * Get a specific item instance
   */
  async getUserItemInstance(instanceId: string): Promise<UserItemInstance | null> {
    return this.db.userItemInstance.findUnique({
      where: { id: instanceId },
      include: {
        item: true
      }
    });
  }
  
  /**
   * Update tool durability
   */
  async updateToolDurability(instanceId: string, change: number): Promise<UserItemInstance> {
    // Get the current instance to check current durability
    const instance = await this.getUserItemInstance(instanceId);
    if (!instance) {
      throw new Error(`Item instance with id ${instanceId} not found`);
    }
    
    if (instance.durability === null || instance.durability === undefined) {
      throw new Error(`Item instance ${instanceId} does not track durability`);
    }
    
    // Calculate new durability, ensuring it doesn't go negative
    const newDurability = Math.max(0, instance.durability + change);
    
    // Update the instance
    const updated = await this.db.userItemInstance.update({
      where: { id: instanceId },
      data: {
        durability: newDurability
      }
    });
    
    // If durability reached zero, delete the instance (item broke)
    if (newDurability === 0) {
      await this.removeItemInstance(instanceId);
      
      // Return the updated instance before deletion for proper notification
      return updated;
    }
    
    return updated;
  }
  
  /**
   * Remove a specific item instance
   */
  async removeItemInstance(instanceId: string): Promise<boolean> {
    try {
      await this.db.userItemInstance.delete({
        where: { id: instanceId }
      });
      return true;
    } catch (error) {
      console.error('Error removing item instance:', error);
      return false;
    }
  }
  
  /**
   * Transfer a stackable item between users
   */
  async transferItem(senderId: string, receiverId: string, itemId: string, quantity: number): Promise<boolean> {
    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    
    // Get the item to check if it's stackable and tradable
    const item = await this.itemService.getItemById(itemId);
    if (!item) {
      throw new Error(`Item with id ${itemId} not found`);
    }
    
    if (!item.tradable) {
      throw new Error(`Item ${item.name} is not tradable`);
    }
    
    // Use a transaction to ensure atomicity
    try {
      await this.db.$transaction(async (tx) => {
        // For stackable items
        if (item.stackable) {
          // Check if sender has enough items
          const senderSlot = await tx.inventorySlot.findUnique({
            where: {
              userId_itemId: {
                userId: senderId,
                itemId
              }
            }
          });
          
          if (!senderSlot || senderSlot.quantity < quantity) {
            throw new Error(`Sender does not have ${quantity} of item ${itemId}`);
          }
          
          // Remove from sender
          if (senderSlot.quantity === quantity) {
            await tx.inventorySlot.delete({
              where: { id: senderSlot.id }
            });
          } else {
            await tx.inventorySlot.update({
              where: { id: senderSlot.id },
              data: {
                quantity: {
                  decrement: quantity
                }
              }
            });
          }
          
          // Add to receiver
          const receiverSlot = await tx.inventorySlot.findUnique({
            where: {
              userId_itemId: {
                userId: receiverId,
                itemId
              }
            }
          });
          
          if (receiverSlot) {
            await tx.inventorySlot.update({
              where: { id: receiverSlot.id },
              data: {
                quantity: {
                  increment: quantity
                }
              }
            });
          } else {
            await tx.inventorySlot.create({
              data: {
                userId: receiverId,
                itemId,
                quantity
              }
            });
          }
        } else {
          // For non-stackable items
          // Get the specified number of item instances from sender
          const instances = await tx.userItemInstance.findMany({
            where: {
              userId: senderId,
              itemId
            },
            take: quantity,
          });
          
          if (instances.length < quantity) {
            throw new Error(`Sender does not have ${quantity} instances of item ${itemId}`);
          }
          
          // Transfer each instance
          for (const instance of instances) {
            await tx.userItemInstance.update({
              where: { id: instance.id },
              data: {
                userId: receiverId
              }
            });
          }
        }
        
        // Log the transaction
        await tx.transaction.create({
          data: {
            senderId,
            receiverId,
            type: 'PLAYER_TRADE',
            itemId,
            quantity,
            description: `Trade of ${quantity}x ${item.name}`
          }
        });
      });
      
      return true;
    } catch (error) {
      console.error('Item transfer failed:', error);
      return false;
    }
  }
  
  /**
   * Transfer a single item instance between users
   */
  async transferItemInstance(senderId: string, receiverId: string, instanceId: string): Promise<boolean> {
    try {
      // Use a transaction to ensure atomicity
      await this.db.$transaction(async (tx) => {
        // Get instance and verify sender owns it
        const instance = await tx.userItemInstance.findUnique({
          where: { id: instanceId },
          include: { item: true }
        });
        
        if (!instance) {
          throw new Error(`Item instance ${instanceId} not found`);
        }
        
        if (instance.userId !== senderId) {
          throw new Error(`Sender does not own item instance ${instanceId}`);
        }
        
        if (!instance.item.tradable) {
          throw new Error(`Item ${instance.item.name} is not tradable`);
        }
        
        // Transfer the instance
        await tx.userItemInstance.update({
          where: { id: instanceId },
          data: {
            userId: receiverId
          }
        });
        
        // Log the transaction
        await tx.transaction.create({
          data: {
            senderId,
            receiverId,
            type: 'PLAYER_TRADE',
            itemId: instance.itemId,
            quantity: 1,
            description: `Trade of ${instance.item.name} (Instance: ${instanceId})`
          }
        });
      });
      
      return true;
    } catch (error) {
      console.error('Item instance transfer failed:', error);
      return false;
    }
  }
}
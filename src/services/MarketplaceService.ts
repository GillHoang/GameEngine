import { MarketListing, Transaction, TransactionType } from "@prisma/client";
import {
  IMarketplaceService,
  MarketListingWithDetails,
  SearchOptions,
  PurchaseResult,
} from "../interfaces/IMarketplaceService";
import { DatabaseContext } from "../utils/DatabaseContext";
import { UserService } from "./UserService";
import { InventoryService } from "./InventoryService";
import { ItemService } from "./ItemService";

/**
 * Service responsible for marketplace-related operations
 */
export class MarketplaceService implements IMarketplaceService {
  private db = DatabaseContext.getInstance().getClient();
  private userService: UserService;
  private inventoryService: InventoryService;
  private itemService: ItemService;

  constructor(
    userService: UserService,
    inventoryService: InventoryService,
    itemService: ItemService
  ) {
    this.userService = userService;
    this.inventoryService = inventoryService;
    this.itemService = itemService;
  }

  /**
   * Get a listing by ID
   */
  async getListingById(
    listingId: string
  ): Promise<MarketListingWithDetails | null> {
    const listing = await this.db.marketListing.findUnique({
      where: { id: listingId },
      include: {
        item: true,
        seller: {
          select: {
            id: true,
            username: true,
            level: true,
          },
        },
      },
    });

    return listing as MarketListingWithDetails;
  }

  /**
   * Create a new listing
   */
  async createListing(
    sellerId: string,
    itemId: string,
    quantity: number,
    pricePerUnit: number,
    expiresAt?: Date
  ): Promise<MarketListingWithDetails | null> {
    try {
      // Check if the item exists and is tradable
      const item = await this.itemService.getItemById(itemId);
      if (!item) {
        throw new Error(`Item with ID ${itemId} not found`);
      }

      if (!item.tradable) {
        throw new Error(`Item ${item.name} is not tradable`);
      }

      // Ensure quantity is valid
      if (quantity <= 0) {
        throw new Error("Quantity must be positive");
      }

      // Ensure price is valid
      if (pricePerUnit <= 0) {
        throw new Error("Price must be positive");
      }

      // Check if the user has enough of the item
      const hasEnough = await this.inventoryService.hasItem(
        sellerId,
        itemId,
        quantity
      );
      if (!hasEnough) {
        throw new Error(
          `You don't have enough ${item.name} to create this listing`
        );
      }

      // If no expiration date is provided, set to 7 days from now
      if (!expiresAt) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
      }

      // Use a transaction to remove the item from inventory and create the listing
      const result = await this.db.$transaction(async (tx) => {
        // Remove the item from the seller's inventory
        await this.inventoryService.removeItem(sellerId, itemId, quantity);

        // Create the listing
        const listing = await tx.marketListing.create({
          data: {
            sellerId,
            itemId,
            quantity,
            price: pricePerUnit, // Use price instead of pricePerUnit to match schema
            // Add status field if required by your schema
            status: "ACTIVE",
            // Add expiration date field if supported by schema
          },
          include: {
            item: true,
            seller: {
              select: {
                id: true,
                username: true,
                level: true,
              },
            },
          },
        });

        return listing as MarketListingWithDetails;
      });

      return result;
    } catch (error) {
      console.error("Error creating listing:", error);
      return null;
    }
  }

  /**
   * Cancel a listing and return the item to the seller
   */
  async cancelListing(sellerId: string, listingId: string): Promise<boolean> {
    try {
      // Get listing details
      const listing = await this.getListingById(listingId);

      if (!listing) {
        throw new Error(`Listing with ID ${listingId} not found`);
      }

      // Check if the caller is the seller
      if (listing.sellerId !== sellerId) {
        throw new Error("You can only cancel your own listings");
      }

      // Use a transaction to delete the listing and return the item
      await this.db.$transaction(async (tx) => {
        // Delete the listing
        await tx.marketListing.delete({
          where: { id: listingId },
        });

        // Return the item to the seller's inventory
        await this.inventoryService.addItem(
          sellerId,
          listing.itemId,
          listing.quantity
        );

        // Log the transaction
        await tx.transaction.create({
          data: {
            senderId: sellerId,
            receiverId: sellerId, // Self-transaction for cancellation
            type: TransactionType.MARKET_SALE,
            itemId: listing.itemId,
            quantity: listing.quantity,
            amount: 0,
            description: `Cancelled listing for ${listing.quantity}x ${listing.item.name}`,
          },
        });
      });

      return true;
    } catch (error) {
      console.error("Error cancelling listing:", error);
      return false;
    }
  }

  /**
   * Purchase an item listing
   */
  async purchaseListing(
    buyerId: string,
    listingId: string,
    quantity?: number
  ): Promise<PurchaseResult> {
    try {
      // Get listing details
      const listing = await this.getListingById(listingId);

      if (!listing) {
        return {
          success: false,
          error: `Listing with ID ${listingId} not found`,
        };
      }

      // Check if listing has expired (if your schema supports expiresAt)
      const currentDate = new Date();
      if (listing.status !== "ACTIVE") {
        return {
          success: false,
          error: "This listing is no longer active",
        };
      }

      // Default to buying the whole listing if quantity not specified
      const purchaseQuantity = quantity ?? listing.quantity;

      // Validate purchase quantity
      if (purchaseQuantity <= 0) {
        return {
          success: false,
          error: "Purchase quantity must be positive",
        };
      }

      if (purchaseQuantity > listing.quantity) {
        return {
          success: false,
          error: `Listing only has ${listing.quantity} available`,
        };
      }

      // Check if buyer is trying to buy their own listing
      if (listing.sellerId === buyerId) {
        return {
          success: false,
          error: "You cannot buy your own listing",
        };
      }

      // Calculate the total cost
      const totalCost = listing.price * purchaseQuantity;

      // Check if buyer has enough currency
      const buyer = await this.userService.getUserById(buyerId);
      if (!buyer) {
        return {
          success: false,
          error: "Buyer not found",
        };
      }

      if (buyer.currency < totalCost) {
        return {
          success: false,
          error: `Not enough currency. Need ${totalCost}, you have ${buyer.currency}`,
        };
      }

      // Use a transaction to handle the purchase
      await this.db.$transaction(async (tx) => {
        // Transfer currency from buyer to seller
        await this.userService.removeCurrency(buyerId, totalCost);
        await this.userService.addCurrency(listing.sellerId, totalCost);

        // Add item to buyer's inventory
        await this.inventoryService.addItem(
          buyerId,
          listing.itemId,
          purchaseQuantity
        );

        // Update or delete the listing
        if (purchaseQuantity === listing.quantity) {
          // Delete the listing if buying all
          await tx.marketListing.delete({
            where: { id: listingId },
          });
        } else {
          // Update the listing with reduced quantity
          await tx.marketListing.update({
            where: { id: listingId },
            data: {
              quantity: listing.quantity - purchaseQuantity,
            },
          });
        }

        // Log the transaction
        await tx.transaction.create({
          data: {
            senderId: buyerId,
            receiverId: listing.sellerId,
            type: TransactionType.MARKET_SALE,
            itemId: listing.itemId,
            quantity: purchaseQuantity,
            amount: totalCost,
            description: `Purchased ${purchaseQuantity}x ${listing.item.name} for ${totalCost} currency`,
          },
        });
      });

      return {
        success: true,
        listing,
        quantityPurchased: purchaseQuantity,
        totalCost,
      };
    } catch (error) {
      console.error("Error purchasing listing:", error);
      return {
        success: false,
        error: `An error occurred: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Get all active listings
   */
  async getAllListings(
    options?: SearchOptions
  ): Promise<MarketListingWithDetails[]> {
    const where: any = {
      status: "ACTIVE", // Use status instead of expiresAt
    };

    // Apply filters if provided
    if (options) {
      if (options.itemId) {
        where.itemId = options.itemId;
      }
      if (options.sellerId) {
        where.sellerId = options.sellerId;
      }
      if (options.minPrice) {
        where.price = { ...where.price, gte: options.minPrice };
      }
      if (options.maxPrice) {
        where.price = { ...where.price, lte: options.maxPrice };
      }
    }

    const listings = await this.db.marketListing.findMany({
      where,
      include: {
        item: true,
        seller: {
          select: {
            id: true,
            username: true,
            level: true,
          },
        },
      },
      orderBy: {
        price: options?.sortByPrice === "desc" ? "desc" : "asc",
      },
      skip: options?.skip,
      take: options?.limit ?? 50, // Default to 50 results per page
    });

    return listings as MarketListingWithDetails[];
  }

  /**
   * Search for listings
   */
  async searchListings(
    searchTerm: string,
    options?: SearchOptions
  ): Promise<MarketListingWithDetails[]> {
    // Get items that match the search term
    const matchingItems = await this.db.item.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm } }, // Remove insensitive mode if not supported
          { description: { contains: searchTerm } },
        ],
      },
      select: { id: true },
    });

    const itemIds = matchingItems.map((item) => item.id);

    // No matching items found
    if (itemIds.length === 0) {
      return [];
    }

    // Construct the where clause
    const where: any = {
      itemId: { in: itemIds },
      status: "ACTIVE", // Use status instead of expiresAt
    };

    // Apply additional filters
    if (options) {
      if (options.sellerId) {
        where.sellerId = options.sellerId;
      }
      if (options.minPrice) {
        where.price = { ...where.price, gte: options.minPrice };
      }
      if (options.maxPrice) {
        where.price = { ...where.price, lte: options.maxPrice };
      }
    }

    // Get listings that match the search
    const listings = await this.db.marketListing.findMany({
      where,
      include: {
        item: true,
        seller: {
          select: {
            id: true,
            username: true,
            level: true,
          },
        },
      },
      orderBy: {
        price: options?.sortByPrice === "desc" ? "desc" : "asc",
      },
      skip: options?.skip,
      take: options?.limit ?? 50,
    });

    return listings as MarketListingWithDetails[];
  }

  /**
   * Get all listings for a specific seller
   */
  async getListingsBySeller(
    sellerId: string
  ): Promise<MarketListingWithDetails[]> {
    return this.getAllListings({ sellerId });
  }

  /**
   * Get recent transactions
   */
  async getRecentTransactions(
    userId: string,
    limit: number = 10
  ): Promise<Transaction[]> {
    return this.db.transaction.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}

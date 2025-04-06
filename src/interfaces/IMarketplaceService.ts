import { MarketListing, Item, Transaction } from "@prisma/client";

export interface MarketListingWithDetails extends MarketListing {
  item: Item;
  seller: {
    id: string;
    username: string;
    level: number;
  };
}

export interface SearchOptions {
  itemId?: string;
  sellerId?: string;
  minPrice?: number;
  maxPrice?: number;
  sortByPrice?: "asc" | "desc";
  skip?: number;
  limit?: number;
}

export interface CreateListingResult {
  success: boolean;
  listing?: MarketListingWithDetails;
  error?: string;
}

export interface PurchaseResult {
  success: boolean;
  listing?: MarketListingWithDetails;
  quantityPurchased?: number;
  totalCost?: number;
  error?: string;
}

export interface IMarketplaceService {
  // Listing operations
  createListing(
    sellerId: string,
    itemId: string,
    quantity: number,
    pricePerUnit: number,
    expiresAt?: Date
  ): Promise<MarketListingWithDetails | null>;

  cancelListing(sellerId: string, listingId: string): Promise<boolean>;
  purchaseListing(buyerId: string, listingId: string, quantity?: number): Promise<PurchaseResult>;

  // Listing retrieval
  getListingById(listingId: string): Promise<MarketListingWithDetails | null>;
  getAllListings(options?: SearchOptions): Promise<MarketListingWithDetails[]>;
  searchListings(searchTerm: string, options?: SearchOptions): Promise<MarketListingWithDetails[]>;
  getListingsBySeller(sellerId: string): Promise<MarketListingWithDetails[]>;
  getRecentTransactions(userId: string, limit?: number): Promise<Transaction[]>;
}

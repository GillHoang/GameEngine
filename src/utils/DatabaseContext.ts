import { PrismaClient } from '@prisma/client';

/**
 * Singleton class to manage database connections
 * Ensures only one instance of PrismaClient is created
 */
export class DatabaseContext {
  private static instance: DatabaseContext;
  private prisma: PrismaClient;
  
  private constructor() {
    this.prisma = new PrismaClient();
  }
  
  /**
   * Get the singleton instance of DatabaseContext
   */
  public static getInstance(): DatabaseContext {
    if (!DatabaseContext.instance) {
      DatabaseContext.instance = new DatabaseContext();
    }
    
    return DatabaseContext.instance;
  }
  
  /**
   * Get the Prisma client
   */
  public getClient(): PrismaClient {
    return this.prisma;
  }
  
  /**
   * Disconnect the Prisma client (should be called when shutting down)
   */
  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
  
  /**
   * Connect the Prisma client (only needed if previously disconnected)
   */
  public async connect(): Promise<void> {
    await this.prisma.$connect();
  }
}

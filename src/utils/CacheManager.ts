/**
 * Simple in-memory cache manager with TTL support
 * Used by services to cache database results
 */
export class CacheManager<T> {
  private cache: Map<string, { data: T; expires: number }> = new Map();
  private namespace: string;
  private defaultTtl: number; // Time-to-live in seconds

  // Singleton instance
  private static instance: CacheManager<any>;

  /**
   * Get the singleton instance of CacheManager
   * @returns The CacheManager instance
   */
  public static getInstance(): CacheManager<any> {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager('global', 3600);
    }
    return CacheManager.instance;
  }

  /**
   * Create a new cache manager
   * @param namespace Namespace for this cache instance
   * @param defaultTtl Default time-to-live in seconds
   */
  constructor(namespace: string, defaultTtl: number = 3600) {
    this.namespace = namespace;
    this.defaultTtl = defaultTtl;

    // Set up periodic cleanup of expired items
    setInterval(() => this.cleanupExpired(), 60000); // Cleanup every minute
  }

  /**
   * Generate a cache key
   */
  private getKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  /**
   * Get an item from the cache
   */
  get(key: string): T | null {
    const cacheKey = this.getKey(key);
    const cachedItem = this.cache.get(cacheKey);

    if (!cachedItem) {
      return null;
    }

    // Check if item is expired
    if (cachedItem.expires < Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cachedItem.data;
  }

  /**
   * Set an item in the cache
   * @param key The cache key
   * @param data The data to cache
   * @param ttl Time-to-live in seconds (overrides the default)
   */
  set(key: string, data: T, ttl?: number): void {
    const cacheKey = this.getKey(key);
    const expiresIn = ttl ?? this.defaultTtl;
    const expires = Date.now() + expiresIn * 1000;

    this.cache.set(cacheKey, {
      data,
      expires,
    });
  }

  /**
   * Delete an item from the cache
   */
  delete(key: string): boolean {
    const cacheKey = this.getKey(key);
    return this.cache.delete(cacheKey);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove all expired items from the cache
   */
  cleanupExpired(): void {
    const now = Date.now();

    for (const [key, value] of this.cache.entries()) {
      if (value.expires < now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get the size of the cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys()).map((key) =>
      key.substring(this.namespace.length + 1)
    );
  }
}

import { Zone, Job } from '@prisma/client';
import { IZoneService, ZoneWithJobs } from '../interfaces/IZoneService';
import { DatabaseContext } from '../utils/DatabaseContext';
import { CacheManager } from '../utils/CacheManager';
import { EnergyManager } from '../utils/EnergyManager';
import { UserEnergyState } from '../models/UserEnergyState';
import { ZoneConfig } from '../models/ZoneConfig';

/**
 * Service responsible for zone-related operations
 */
export class ZoneService implements IZoneService {
  private db = DatabaseContext.getInstance().getClient();
  private cache: CacheManager<ZoneWithJobs | ZoneWithJobs[]> = new CacheManager<ZoneWithJobs | ZoneWithJobs[]>('zones', 3600);
  
  // Keep track of recovery zones separately since the database schema might not have this field yet
  private recoveryZones: Set<string> = new Set();
  private zoneRecoveryMultipliers: Map<string, number> = new Map();
  
  /**
   * Get a zone by ID with associated jobs
   */
  async getZoneById(zoneId: string): Promise<ZoneWithJobs | null> {
    // Try to get from cache first
    const cachedZone = this.cache.get(zoneId);
    if (cachedZone && !Array.isArray(cachedZone)) {
      return cachedZone;
    }
    
    // Not in cache, get from database
    const zone = await this.db.zone.findUnique({
      where: { id: zoneId },
      include: { jobs: true }
    });
    
    // Cache the result if found
    if (zone) {
      this.cache.set(zoneId, zone);
      this.cache.set(`name:${zone.name}`, zone);
    }
    
    return zone;
  }
  
  /**
   * Get a zone by name with associated jobs
   */
  async getZoneByName(name: string): Promise<ZoneWithJobs | null> {
    // Try to get from cache first
    const cachedZone = this.cache.get(`name:${name}`);
    if (cachedZone && !Array.isArray(cachedZone)) {
      return cachedZone;
    }
    
    // Not in cache, get from database
    const zone = await this.db.zone.findUnique({
      where: { name },
      include: { jobs: true }
    });
    
    // Cache the result if found
    if (zone) {
      this.cache.set(zone.id, zone);
      this.cache.set(`name:${zone.name}`, zone);
    }
    
    return zone;
  }
  
  /**
   * Get all zones with their jobs
   */
  async getAllZones(): Promise<ZoneWithJobs[]> {
    // Try to get from cache first
    const cachedZones = this.cache.get('all');
    if (cachedZones && Array.isArray(cachedZones)) {
      return cachedZones;
    }
    
    // Not in cache, get from database
    const zones = await this.db.zone.findMany({
      include: { jobs: true }
    });
    
    // Cache the results
    this.cache.set('all', zones);
    
    // Also cache individual zones
    for (const zone of zones) {
      this.cache.set(zone.id, zone);
      this.cache.set(`name:${zone.name}`, zone);
    }
    
    return zones;
  }
  
  /**
   * Check if a user can access a zone
   */
  async userCanAccessZone(userId: string, zoneId: string): Promise<{ canAccess: boolean; reason?: string }> {
    // Get the zone
    const zone = await this.getZoneById(zoneId);
    if (!zone) {
      return { canAccess: false, reason: 'Zone not found' };
    }
    
    // Get user information to check level
    const user = await this.db.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      return { canAccess: false, reason: 'User not found' };
    }
    
    // Check if user meets the level requirement
    if (user.level < zone.requiredLevel) {
      return { 
        canAccess: false, 
        reason: `This zone requires level ${zone.requiredLevel}. You are level ${user.level}.` 
      };
    }
    
    // In a more complex implementation, you could check for other requirements here
    // such as quest completion, items possessed, etc.
    
    return { canAccess: true };
  }
  
  /**
   * Get zones that a user can access
   */
  async getAccessibleZones(userId: string): Promise<ZoneWithJobs[]> {
    // Get user information to check level
    const user = await this.db.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      return [];
    }
    
    // Get all zones that user meets level requirement for
    const zones = await this.db.zone.findMany({
      where: {
        requiredLevel: { lte: user.level }
      },
      include: { jobs: true }
    });
    
    return zones;
  }
  
  /**
   * Create a new zone
   */
  async createZone(
    name: string, 
    description: string, 
    requiredLevel: number,
    isEnergyRecoveryZone: boolean = false,
    energyRecoveryMultiplier: number = 2.0
  ): Promise<Zone> {
    // Create the zone in the database (without recovery-specific fields for now)
    const zone = await this.db.zone.create({
      data: {
        name,
        description,
        requiredLevel
        // Note: isEnergyRecoveryZone and energyRecoveryMultiplier are not in the schema yet
      }
    });
    
    // If this is a recovery zone, track it in memory
    if (isEnergyRecoveryZone) {
      this.recoveryZones.add(zone.id);
      this.zoneRecoveryMultipliers.set(zone.id, energyRecoveryMultiplier);
    }
    
    // Invalidate caches
    this.cache.delete('all');
    this.cache.delete('recovery_zones');
    
    return zone;
  }
  
  /**
   * Add a job to a zone
   */
  async addJobToZone(zoneId: string, jobId: string): Promise<Job> {
    // Check if zone exists
    const zone = await this.db.zone.findUnique({
      where: { id: zoneId }
    });
    
    if (!zone) {
      throw new Error(`Zone with ID ${zoneId} not found`);
    }
    
    // Check if job exists
    const job = await this.db.job.findUnique({
      where: { id: jobId }
    });
    
    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }
    
    // Update job to associate it with this zone
    const updatedJob = await this.db.job.update({
      where: { id: jobId },
      data: { zoneId }
    });
    
    // Invalidate zone cache
    this.cache.delete(zoneId);
    this.cache.delete(`name:${zone.name}`);
    this.cache.delete('all');
    
    return updatedJob;
  }
  
  /**
   * Check if a zone is a recovery zone
   */
  private isRecoveryZone(zoneId: string): boolean {
    return this.recoveryZones.has(zoneId);
  }
  
  /**
   * Get recovery multiplier for a zone
   */
  private getRecoveryMultiplier(zoneId: string): number {
    return this.zoneRecoveryMultipliers.get(zoneId) || 2.0;
  }
  
  /**
   * Get all energy recovery zones
   */
  async getRecoveryZones(): Promise<ZoneWithJobs[]> {
    // Try to get from cache first
    const cachedZones = this.cache.get('recovery_zones');
    if (cachedZones && Array.isArray(cachedZones)) {
      return cachedZones;
    }
    
    // Get all zones
    const allZones = await this.getAllZones();
    
    // Filter to only recovery zones
    const zones = allZones.filter(zone => this.isRecoveryZone(zone.id));
    
    // Cache the results
    this.cache.set('recovery_zones', zones);
    
    return zones;
  }
  
  /**
   * Enter an energy recovery zone to boost energy regeneration
   */
  async enterRecoveryZone(userId: string, zoneId: string): Promise<UserEnergyState> {
    // Check access
    const accessCheck = await this.userCanAccessZone(userId, zoneId);
    if (!accessCheck.canAccess) {
      throw new Error(accessCheck.reason || 'Cannot access this zone');
    }
    
    // Check if zone is a recovery zone
    if (!this.isRecoveryZone(zoneId)) {
      throw new Error('This is not a recovery zone');
    }
    
    // Get user's current energy state
    const userEnergyState = await this.db.userEnergyState.findUnique({
      where: { userId }
    });
    
    if (!userEnergyState) {
      throw new Error('User energy state not found');
    }
    
    // Calculate regenerated energy up to this point
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    
    const maxEnergy = EnergyManager.getMaxEnergyForLevel(
      user.level, 
      userEnergyState.passiveMaxEnergyBonus
    );
    
    // Calculate regenerated energy before entering the zone
    const currentEnergy = EnergyManager.calculateRegeneratedEnergy(
      userEnergyState.currentEnergy,
      maxEnergy,
      userEnergyState.lastEnergyUpdate,
      userEnergyState.regenRateMultiplier
    );
    
    // Update user energy state to mark them as in the recovery zone
    const updatedEnergyState = await this.db.userEnergyState.update({
      where: { userId },
      data: {
        currentEnergy,
        lastEnergyUpdate: new Date(),
        currentRecoveryZoneId: zoneId,
        recoveryZoneEntryTime: new Date()
      }
    });
    
    return updatedEnergyState;
  }
  
  /**
   * Leave the current energy recovery zone
   */
  async leaveRecoveryZone(userId: string): Promise<UserEnergyState> {
    // Get user's current energy state
    const userEnergyState = await this.db.userEnergyState.findUnique({
      where: { userId }
    });
    
    if (!userEnergyState || !userEnergyState.currentRecoveryZoneId) {
      throw new Error('User is not currently in a recovery zone');
    }
    
    const recoveryZoneId = userEnergyState.currentRecoveryZoneId;
    
    // Check if the zone exists
    const zone = await this.getZoneById(recoveryZoneId);
    if (!zone) {
      throw new Error('Recovery zone not found');
    }
    
    // Calculate regenerated energy with the recovery zone boost
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    
    const maxEnergy = EnergyManager.getMaxEnergyForLevel(
      user.level, 
      userEnergyState.passiveMaxEnergyBonus
    );
    
    // Apply zone's recovery multiplier to calculate energy gained while in the zone
    const currentEnergy = EnergyManager.calculateRegeneratedEnergy(
      userEnergyState.currentEnergy,
      maxEnergy,
      userEnergyState.lastEnergyUpdate,
      userEnergyState.regenRateMultiplier,
      true // In recovery zone
    );
    
    // Update user energy state to mark them as leaving the recovery zone
    const updatedEnergyState = await this.db.userEnergyState.update({
      where: { userId },
      data: {
        currentEnergy,
        lastEnergyUpdate: new Date(),
        currentRecoveryZoneId: null,
        recoveryZoneEntryTime: null
      }
    });
    
    return updatedEnergyState;
  }
  
  /**
   * Clear the zone cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Refresh the zone cache
   */
  async refreshCache(): Promise<void> {
    // Clear existing cache
    this.clearCache();
    
    // Reload all zones
    const zones = await this.db.zone.findMany({
      include: { jobs: true }
    });
    
    // Cache 'all' zones
    this.cache.set('all', zones);
    
    // Cache individual zones
    for (const zone of zones) {
      this.cache.set(zone.id, zone);
      this.cache.set(`name:${zone.name}`, zone);
    }
    
    // Cache recovery zones - filter out just the ones we've marked as recovery zones
    const recoveryZones = zones.filter(z => this.isRecoveryZone(z.id));
    this.cache.set('recovery_zones', recoveryZones);
  }
  
  /**
   * Set a zone as a recovery zone (for admin use)
   */
  setZoneAsRecoveryZone(zoneId: string, multiplier: number = 2.0): void {
    this.recoveryZones.add(zoneId);
    this.zoneRecoveryMultipliers.set(zoneId, multiplier);
    this.cache.delete('recovery_zones');
  }
  
  /**
   * Remove recovery zone status from a zone (for admin use)
   */
  removeRecoveryZoneStatus(zoneId: string): void {
    this.recoveryZones.delete(zoneId);
    this.zoneRecoveryMultipliers.delete(zoneId);
    this.cache.delete('recovery_zones');
  }
}
/**
 * Configuration for a game zone
 */
export interface ZoneConfig {
  /**
   * Unique identifier for the zone
   */
  id: string; // Changed from number to string to match other services

  /**
   * Name of the zone
   */
  name: string;

  /**
   * Description of the zone
   */
  description: string;

  /**
   * Minimum level required to access this zone
   */
  requiredLevel: number;

  /**
   * Whether this zone is a recovery zone for faster energy regeneration
   */
  isEnergyRecoveryZone: boolean;

  /**
   * Energy regeneration multiplier if this is a recovery zone (stacks with other boosts)
   */
  energyRecoveryMultiplier?: number;

  /**
   * Optional cost in currency to use this recovery zone
   */
  recoveryCostPerMinute?: number;

  /**
   * Special description shown when the zone is used for recovery
   */
  recoveryDescription?: string;
  
  /**
   * Whether a player can perform other activities while recovering in this zone
   */
  allowsActivitiesDuringRecovery?: boolean;
  
  /**
   * Image or background for this zone
   */
  imageUrl: string;
}
/**
 * Represents the energy state for a user including boost and overflow information
 */
export interface UserEnergyState {
  /**
   * User ID this energy state belongs to
   */
  userId: string; // Changed from number to string to match other services

  /**
   * Current energy amount
   */
  currentEnergy: number;

  /**
   * Maximum energy capacity for this user (without overflow)
   */
  maxEnergy: number;

  /**
   * Timestamp of last energy update
   */
  lastEnergyUpdate: Date;

  /**
   * Current regeneration rate multiplier
   */
  regenRateMultiplier: number;

  /**
   * Expiry timestamp for any regen rate boost
   */
  regenBoostExpiry: Date | null;

  /**
   * Expiry timestamp for any overflow energy
   */
  overflowExpiry: Date | null;

  /**
   * ID of the recovery zone the user is currently in (if any)
   */
  currentRecoveryZoneId: string | null; // Changed from number to string to match other services

  /**
   * Timestamp when the user entered the recovery zone
   */
  recoveryZoneEntryTime: Date | null;

  /**
   * Bonus to maximum energy from passive skills (percentage as decimal)
   */
  passiveMaxEnergyBonus: number;

  /**
   * Energy efficiency bonus from passive skills (percentage as decimal)
   */
  passiveEfficiencyBonus: number;
}
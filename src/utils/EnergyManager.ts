/**
 * Utility class for energy-related calculations and regeneration
 */
export class EnergyManager {
  /**
   * Base energy regeneration rate in points per minute
   */
  private static readonly baseRegenerationRate: number = 1;

  /**
   * Base max energy for level 1
   */
  private static readonly baseMaxEnergy: number = 100;

  /**
   * Energy increase per level
   */
  private static readonly energyPerLevel: number = 5;

  /**
   * Maximum percentage that energy can overflow beyond max capacity
   */
  private static readonly maxOverflowPercentage: number = 0.50; // 50% overflow maximum

  /**
   * Default overflow duration in minutes
   */
  private static readonly defaultOverflowDuration: number = 60; // 1 hour

  /**
   * Boost multiplier for recovery zones
   */
  private static readonly recoveryZoneMultiplier: number = 2.5;

  /**
   * Calculate the maximum energy capacity for a given level
   * 
   * @param level User level
   * @param passiveBonus Additional energy from passive skills (percentage as decimal)
   * @returns Maximum energy capacity at the given level
   */
  public static getMaxEnergyForLevel(level: number, passiveBonus: number = 0): number {
    if (level < 1) {
      throw new Error('Level must be at least 1');
    }
    
    if (passiveBonus < 0) {
      throw new Error('Passive bonus cannot be negative');
    }
    
    const baseEnergy = this.baseMaxEnergy + (level - 1) * this.energyPerLevel;
    return Math.floor(baseEnergy * (1 + passiveBonus));
  }

  /**
   * Calculate how much energy a user should have regenerated since their last update
   *
   * @param currentEnergy Current energy level
   * @param maxEnergy Maximum energy capacity
   * @param lastEnergyUpdate Timestamp of the last energy update
   * @param regenMultiplier Optional multiplier for regeneration speed
   * @param inRecoveryZone Whether the user is in a recovery zone
   * @returns The new energy amount after regeneration
   */
  public static calculateRegeneratedEnergy(
    currentEnergy: number,
    maxEnergy: number,
    lastEnergyUpdate: Date,
    regenMultiplier: number = 1.0,
    inRecoveryZone: boolean = false
  ): number {
    // Validate inputs
    if (currentEnergy < 0) {
      throw new Error('Current energy cannot be negative');
    }
    
    if (maxEnergy <= 0) {
      throw new Error('Maximum energy must be positive');
    }
    
    if (!lastEnergyUpdate || !(lastEnergyUpdate instanceof Date)) {
      throw new Error('Last energy update must be a valid Date');
    }
    
    if (regenMultiplier < 0) {
      throw new Error('Regeneration multiplier cannot be negative');
    }
    
    // Calculate the effective cap (including any overflow)
    const effectiveCap = this.getEffectiveEnergyCap(currentEnergy, maxEnergy);
    
    // If already at effective cap, no need to calculate
    if (currentEnergy >= effectiveCap) {
      return currentEnergy;
    }

    // Calculate time passed in minutes
    const now = new Date();
    const minutesPassed =
      Math.max(0, (now.getTime() - lastEnergyUpdate.getTime()) / (1000 * 60));

    // Apply recovery zone multiplier if applicable
    const effectiveMultiplier = inRecoveryZone 
      ? regenMultiplier * this.recoveryZoneMultiplier 
      : regenMultiplier;

    // Calculate energy gained
    const energyGained = Math.floor(
      minutesPassed * this.baseRegenerationRate * effectiveMultiplier
    );

    // Calculate new energy, capped at effective cap
    const newEnergy = Math.min(currentEnergy + energyGained, effectiveCap);

    return newEnergy;
  }

  /**
   * Calculate time until full energy
   *
   * @param currentEnergy Current energy level
   * @param maxEnergy Maximum energy capacity
   * @param regenMultiplier Optional multiplier for regeneration speed
   * @param inRecoveryZone Whether the user is in a recovery zone
   * @returns Time in minutes until energy is fully regenerated
   */
  public static calculateTimeUntilFullEnergy(
    currentEnergy: number,
    maxEnergy: number,
    regenMultiplier: number = 1.0,
    inRecoveryZone: boolean = false
  ): number {
    // Validate inputs
    if (currentEnergy < 0) {
      throw new Error('Current energy cannot be negative');
    }
    
    if (maxEnergy <= 0) {
      throw new Error('Maximum energy must be positive');
    }
    
    // If already at max, time is 0
    if (currentEnergy >= maxEnergy) {
      return 0;
    }

    // Apply recovery zone multiplier if applicable
    const effectiveMultiplier = inRecoveryZone 
      ? regenMultiplier * this.recoveryZoneMultiplier 
      : regenMultiplier;
      
    if (effectiveMultiplier <= 0) {
      throw new Error('Effective regeneration multiplier must be positive');
    }

    // Calculate energy needed and time to regenerate
    const energyNeeded = maxEnergy - currentEnergy;
    const minutesNeeded =
      energyNeeded / (this.baseRegenerationRate * effectiveMultiplier);

    return Math.ceil(minutesNeeded);
  }

  /**
   * Get formatted time until full energy
   *
   * @param currentEnergy Current energy level
   * @param maxEnergy Maximum energy capacity
   * @param regenMultiplier Optional multiplier for regeneration speed
   * @param inRecoveryZone Whether the user is in a recovery zone
   * @returns Formatted string showing time until full energy (e.g., "2h 30m")
   */
  public static getFormattedTimeUntilFullEnergy(
    currentEnergy: number,
    maxEnergy: number,
    regenMultiplier: number = 1.0,
    inRecoveryZone: boolean = false
  ): string {
    const minutes = this.calculateTimeUntilFullEnergy(
      currentEnergy,
      maxEnergy,
      regenMultiplier,
      inRecoveryZone
    );

    // Already full
    if (minutes <= 0) {
      return "Full";
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    } else {
      return `${remainingMinutes}m`;
    }
  }

  /**
   * Calculate energy regeneration progress as a percentage
   *
   * @param currentEnergy Current energy level
   * @param maxEnergy Maximum energy capacity
   * @returns A number between 0 and 1 representing completion percentage
   */
  public static getEnergyProgress(
    currentEnergy: number,
    maxEnergy: number
  ): number {
    if (maxEnergy <= 0) {
      throw new Error('Maximum energy must be positive');
    }
    
    return Math.min(1.0, Math.max(0, currentEnergy) / maxEnergy);
  }

  /**
   * Calculate daily energy income based on regeneration rate
   *
   * @param regenMultiplier Optional multiplier for regeneration speed
   * @param inRecoveryZone Whether the user is in a recovery zone
   * @returns Total energy generated in 24 hours
   */
  public static getDailyEnergyIncome(
    regenMultiplier: number = 1.0, 
    inRecoveryZone: boolean = false
  ): number {
    if (regenMultiplier < 0) {
      throw new Error('Regeneration multiplier cannot be negative');
    }
    
    const effectiveMultiplier = inRecoveryZone 
      ? regenMultiplier * this.recoveryZoneMultiplier 
      : regenMultiplier;

    const minutesPerDay = 24 * 60;
    return Math.floor(
      minutesPerDay * this.baseRegenerationRate * effectiveMultiplier
    );
  }

  /**
   * Apply an energy boost item effect
   * 
   * @param currentEnergy Current energy level
   * @param maxEnergy Maximum energy capacity
   * @param boostAmount Amount of energy to add
   * @param allowOverflow Whether the boost can exceed max energy
   * @param overflowDuration Duration in minutes that overflow lasts (default: 60 minutes)
   * @returns Object containing the new energy amount and overflow expiry timestamp
   */
  public static applyEnergyBoost(
    currentEnergy: number,
    maxEnergy: number,
    boostAmount: number,
    allowOverflow: boolean = true,
    overflowDuration: number = this.defaultOverflowDuration
  ): { energy: number; overflowExpiry: Date | null } {
    // Validate inputs
    if (currentEnergy < 0) {
      throw new Error('Current energy cannot be negative');
    }
    
    if (maxEnergy <= 0) {
      throw new Error('Maximum energy must be positive');
    }
    
    if (boostAmount <= 0) {
      throw new Error('Boost amount must be positive');
    }
    
    if (overflowDuration < 0) {
      throw new Error('Overflow duration cannot be negative');
    }
    
    // Calculate the maximum possible energy with overflow
    const maxPossibleEnergy = allowOverflow 
      ? maxEnergy * (1 + this.maxOverflowPercentage)
      : maxEnergy;
    
    // Apply the boost with the cap
    const newEnergy = Math.min(currentEnergy + boostAmount, maxPossibleEnergy);
    
    // Set overflow expiry if we exceeded max energy
    let overflowExpiry: Date | null = null;
    if (newEnergy > maxEnergy) {
      overflowExpiry = new Date();
      overflowExpiry.setMinutes(overflowExpiry.getMinutes() + overflowDuration);
    }
    
    return {
      energy: newEnergy,
      overflowExpiry
    };
  }

  /**
   * Get the effective energy cap considering overflow state
   * 
   * @param currentEnergy Current energy level
   * @param maxEnergy Base maximum energy
   * @param overflowExpiry Optional timestamp when overflow expires
   * @returns The effective maximum energy cap
   */
  public static getEffectiveEnergyCap(
    currentEnergy: number,
    maxEnergy: number,
    overflowExpiry: Date | null = null
  ): number {
    // Validate inputs
    if (maxEnergy <= 0) {
      throw new Error('Maximum energy must be positive');
    }
    
    // If there's no overflow or it has expired, cap at max energy
    // but don't reduce below current energy (preserving existing overflow)
    if (!overflowExpiry || new Date() > overflowExpiry) {
      return Math.max(currentEnergy, maxEnergy);
    }
    
    // Otherwise allow up to the overflow limit
    const overflowCap = maxEnergy * (1 + this.maxOverflowPercentage);
    
    // Ensure we don't reduce current energy if it somehow exceeds even the overflow cap
    return Math.max(currentEnergy, overflowCap);
  }
  
  /**
   * Calculate energy efficiency based on passive skills
   * 
   * @param baseEnergyCost Base energy cost of an action
   * @param efficiencyBonus Energy efficiency bonus from passive skills (percentage as decimal)
   * @returns The adjusted energy cost after applying efficiency
   */
  public static calculateEnergyEfficiency(
    baseEnergyCost: number,
    efficiencyBonus: number = 0
  ): number {
    // Validate inputs
    if (baseEnergyCost <= 0) {
      throw new Error('Base energy cost must be positive');
    }
    
    if (efficiencyBonus < 0) {
      throw new Error('Efficiency bonus cannot be negative');
    }
    
    if (efficiencyBonus > 0.9) {
      // Cap efficiency bonus at 90% to prevent costs getting too low
      efficiencyBonus = 0.9;
    }
    
    // Apply efficiency bonus, minimum cost is 1
    return Math.max(1, Math.floor(baseEnergyCost * (1 - efficiencyBonus)));
  }

  /**
   * Check if a user is in energy overflow state
   * 
   * @param currentEnergy Current energy level
   * @param maxEnergy Maximum energy capacity
   * @returns Boolean indicating if user has overflow energy
   */
  public static isInOverflowState(currentEnergy: number, maxEnergy: number): boolean {
    // Validate inputs
    if (maxEnergy <= 0) {
      throw new Error('Maximum energy must be positive');
    }
    
    return currentEnergy > maxEnergy;
  }

  /**
   * Get remaining overflow energy amount
   * 
   * @param currentEnergy Current energy level
   * @param maxEnergy Maximum energy capacity
   * @returns Amount of overflow energy (0 if not in overflow)
   */
  public static getOverflowAmount(currentEnergy: number, maxEnergy: number): number {
    // Validate inputs
    if (maxEnergy <= 0) {
      throw new Error('Maximum energy must be positive');
    }
    
    return Math.max(0, currentEnergy - maxEnergy);
  }
}

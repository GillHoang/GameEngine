/**
 * Represents an energy boost consumable item
 */
export interface EnergyBoostItem {
  /**
   * Unique identifier for the item
   */
  id: number;

  /**
   * Display name of the energy boost item
   */
  name: string;

  /**
   * Description of the energy boost item
   */
  description: string;
  
  /**
   * Amount of energy to restore when consuming this item
   */
  energyRestoreAmount: number;
  
  /**
   * Whether this boost allows energy to exceed max capacity (overflow)
   */
  allowsOverflow: boolean;
  
  /**
   * Duration in minutes that overflow energy lasts if applicable
   */
  overflowDuration: number;
  
  /**
   * Optional regeneration rate multiplier applied for a duration
   */
  regenRateMultiplier?: number;
  
  /**
   * Duration in minutes that regeneration boost lasts if applicable
   */
  regenBoostDuration?: number;
  
  /**
   * Icon or image representing this boost item
   */
  iconUrl: string;
  
  /**
   * Rarity tier of the boost item (common, uncommon, rare, etc.)
   */
  rarityTier: string;
}
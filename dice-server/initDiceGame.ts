/**
 * Dice Game Initialization Script
 * 
 * Ensures that the dice game configuration is properly initialized
 * with default values in the storage system when the server starts.
 */

import { storage } from './storage';

/**
 * Initialize the dice game configuration with default values
 * if it doesn't already exist in the system.
 */
export async function initializeDiceGameConfig() {
  console.log('[INFO] Checking dice game configuration...');
  
  try {
    // Ensure dice game config exists
    const configExists = await (storage as any).ensureDiceGameConfig();
    
    if (configExists) {
      console.log('[INFO] Dice game configuration is available');
    } else {
      console.log('[WARN] Could not verify dice game configuration');
    }
    
    return configExists;
  } catch (error) {
    console.error('[ERROR] Failed to initialize dice game configuration:', error);
    return false;
  }
}

// Add a function to fix common configuration issues
export async function repairDiceGameConfig() {
  try {
    // Call the repair method directly from fileStorage
    const repaired = await (storage as any).repairDiceGameConfig();
    
    if (repaired) {
      console.log('[INFO] Dice game configuration was repaired');
    } else {
      console.log('[INFO] Dice game configuration is valid, no repairs needed');
    }
    
    return true;
  } catch (error) {
    console.error('[ERROR] Failed to repair dice game configuration:', error);
    return false;
  }
} 

/**
 * System Configuration Controller
 * 
 * Handles operations related to system configuration
 */

import { storage } from '../storage';
import { SystemConfig, InsertSystemConfig } from '../../shared/schema';

/**
 * Get the current system configuration
 */
export async function getSystemConfig(): Promise<SystemConfig | undefined> {
  try {
    return await storage.getSystemConfig();
  } catch (error) {
    console.error('Error getting system configuration:', error);
    return undefined;
  }
}

/**
 * Update system configuration
 */
export async function updateSystemConfig(
  data: Partial<InsertSystemConfig>
): Promise<SystemConfig | undefined> {
  try {
    return await storage.updateSystemConfig(data);
  } catch (error) {
    console.error('Error updating system configuration:', error);
    return undefined;
  }
}

/**
 * Initialize system configuration with defaults
 */
export async function initializeDefaultSystemConfig(
  config: InsertSystemConfig
): Promise<SystemConfig | undefined> {
  try {
    return await storage.initializeSystemConfig(config);
  } catch (error) {
    console.error('Error initializing system configuration:', error);
    return undefined;
  }
}

/**
 * Get dice game configuration
 */
export async function getDiceGameConfig(): Promise<any | undefined> {
  try {
    const config = await storage.getSystemConfig();
    return config?.diceGameConfig;
  } catch (error) {
    console.error('Error getting dice game configuration:', error);
    return undefined;
  }
}

/**
 * Update dice game configuration
 */
export async function updateDiceGameConfig(
  diceGameConfig: any
): Promise<SystemConfig | undefined> {
  try {
    const config = await storage.getSystemConfig();
    if (!config) {
      throw new Error('System configuration not found');
    }

    return await storage.updateSystemConfig({ diceGameConfig });
  } catch (error) {
    console.error('Error updating dice game configuration:', error);
    return undefined;
  }
} 
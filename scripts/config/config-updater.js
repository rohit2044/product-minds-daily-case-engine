/**
 * Configuration Updater
 *
 * Provides functions to update configurations in the database.
 * Updates automatically increment version numbers and clear relevant caches.
 */

import { supabase } from '../utils/supabase-client.js';
import { clearCacheKey, clearCache } from './config-loader.js';

/**
 * Update a configuration value
 * @param {string} key - The config key to update
 * @param {Object} value - The new config_value (JSONB)
 * @param {Object} options - Options
 * @param {string} options.updatedBy - Who is making the update
 * @param {string} options.description - Optional new description
 * @returns {Promise<Object>} The updated config row
 */
export async function updateConfig(key, value, options = {}) {
  const { updatedBy = 'system', description } = options;

  // Build update object
  const updateData = {
    config_value: value,
    version: supabase.rpc('increment'), // This won't work, need different approach
    updated_at: new Date().toISOString(),
  };

  // Use the database function for atomic version increment
  const { data, error } = await supabase.rpc('update_config', {
    p_key: key,
    p_value: value,
    p_updated_by: updatedBy,
  });

  if (error) {
    // Fallback to manual update if RPC doesn't exist
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('configurations')
      .update({
        config_value: value,
        updated_at: new Date().toISOString(),
      })
      .eq('config_key', key)
      .select()
      .single();

    if (fallbackError) {
      throw new Error(`Failed to update config "${key}": ${fallbackError.message}`);
    }

    // Clear cache for this key
    clearCacheKey(key);

    return fallbackData;
  }

  // Clear cache for this key
  clearCacheKey(key);

  // Fetch and return the updated row
  const { data: updatedRow } = await supabase
    .from('configurations')
    .select('*')
    .eq('config_key', key)
    .single();

  return updatedRow;
}

/**
 * Update a prompt section's content
 * @param {string} sectionKey - The prompt section key (e.g., 'prompt_mental_models')
 * @param {string} content - The new content string
 * @param {Object} options - Options
 * @param {string} options.updatedBy - Who is making the update
 * @returns {Promise<Object>} The updated config row
 */
export async function updatePromptSection(sectionKey, content, options = {}) {
  const { updatedBy = 'system' } = options;

  // Validate it's a prompt section
  if (!sectionKey.startsWith('prompt_')) {
    throw new Error(`Invalid prompt section key: ${sectionKey}. Must start with "prompt_"`);
  }

  const newValue = { content };

  const { data, error } = await supabase
    .from('configurations')
    .update({
      config_value: newValue,
      updated_at: new Date().toISOString(),
    })
    .eq('config_key', sectionKey)
    .eq('config_type', 'prompt_section')
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update prompt section "${sectionKey}": ${error.message}`);
  }

  // Clear cache for prompt sections
  clearCacheKey(sectionKey);
  clearCacheKey('prompt_section'); // Clear the type cache too

  return data;
}

/**
 * Update a threshold value
 * @param {string} key - The threshold key
 * @param {number} value - The new numeric value
 * @param {Object} options - Options
 * @returns {Promise<Object>} The updated config row
 */
export async function updateThreshold(key, value, options = {}) {
  const { updatedBy = 'system', description } = options;

  // Get current config to preserve other properties
  const { data: current } = await supabase
    .from('configurations')
    .select('config_value')
    .eq('config_key', key)
    .single();

  const newValue = {
    ...current?.config_value,
    value,
  };

  if (description) {
    newValue.description = description;
  }

  return updateConfig(key, newValue, { updatedBy });
}

/**
 * Activate or deactivate a configuration
 * @param {string} key - The config key
 * @param {boolean} isActive - Whether to activate or deactivate
 * @returns {Promise<Object>} The updated config row
 */
export async function setConfigActive(key, isActive) {
  const { data, error } = await supabase
    .from('configurations')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('config_key', key)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to set config "${key}" active=${isActive}: ${error.message}`);
  }

  // Clear all caches since activation status affects queries
  clearCache();

  return data;
}

/**
 * Create a new configuration
 * @param {Object} config - The configuration to create
 * @param {string} config.key - Unique config key
 * @param {Object} config.value - The config_value (JSONB)
 * @param {string} config.type - Config type (prompt_section, system, threshold, feature_flag)
 * @param {string} config.description - Human-readable description
 * @param {string} config.parentKey - Parent key for hierarchical configs
 * @param {number} config.displayOrder - Order for display/assembly
 * @returns {Promise<Object>} The created config row
 */
export async function createConfig(config) {
  const {
    key,
    value,
    type,
    description = '',
    parentKey = null,
    displayOrder = 0,
  } = config;

  const { data, error } = await supabase
    .from('configurations')
    .insert({
      config_key: key,
      config_value: value,
      config_type: type,
      description,
      parent_key: parentKey,
      display_order: displayOrder,
      is_active: true,
      version: 1,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create config "${key}": ${error.message}`);
  }

  // Clear cache for this type
  clearCacheKey(type);

  return data;
}

/**
 * Delete a configuration (hard delete - use with caution)
 * @param {string} key - The config key to delete
 * @returns {Promise<boolean>} Whether deletion was successful
 */
export async function deleteConfig(key) {
  const { error } = await supabase
    .from('configurations')
    .delete()
    .eq('config_key', key);

  if (error) {
    throw new Error(`Failed to delete config "${key}": ${error.message}`);
  }

  // Clear all caches
  clearCache();

  return true;
}

/**
 * Get version history for a config (not implemented in current schema)
 * This would require a separate config_versions table
 * @param {string} key - The config key
 * @returns {Promise<Array>} Version history
 */
export async function getConfigHistory(key) {
  // Current implementation only tracks current version
  // Could be extended with a config_versions table
  const { data, error } = await supabase
    .from('configurations')
    .select('config_key, config_value, version, updated_at')
    .eq('config_key', key)
    .single();

  if (error) {
    return [];
  }

  // Return single entry as "history"
  return [
    {
      version: data.version,
      value: data.config_value,
      updatedAt: data.updated_at,
    },
  ];
}

/**
 * Bulk update multiple configurations
 * @param {Array<{key: string, value: Object}>} updates - Array of updates
 * @param {Object} options - Options
 * @returns {Promise<Array>} Array of updated configs
 */
export async function bulkUpdateConfigs(updates, options = {}) {
  const { updatedBy = 'system' } = options;
  const results = [];

  for (const update of updates) {
    try {
      const result = await updateConfig(update.key, update.value, { updatedBy });
      results.push({ key: update.key, success: true, data: result });
    } catch (error) {
      results.push({ key: update.key, success: false, error: error.message });
    }
  }

  return results;
}

/**
 * Clone a configuration with a new key
 * Useful for A/B testing prompt variations
 * @param {string} sourceKey - The key to clone from
 * @param {string} newKey - The new key for the clone
 * @param {Object} options - Options
 * @param {boolean} options.activate - Whether to activate the clone immediately
 * @returns {Promise<Object>} The cloned config
 */
export async function cloneConfig(sourceKey, newKey, options = {}) {
  const { activate = false } = options;

  // Fetch source config
  const { data: source, error } = await supabase
    .from('configurations')
    .select('*')
    .eq('config_key', sourceKey)
    .single();

  if (error || !source) {
    throw new Error(`Source config "${sourceKey}" not found`);
  }

  // Create clone
  const { data: clone, error: cloneError } = await supabase
    .from('configurations')
    .insert({
      config_key: newKey,
      config_value: source.config_value,
      config_type: source.config_type,
      description: `Clone of ${sourceKey}: ${source.description || ''}`,
      parent_key: source.parent_key,
      display_order: source.display_order,
      is_active: activate,
      version: 1,
    })
    .select()
    .single();

  if (cloneError) {
    throw new Error(`Failed to clone config: ${cloneError.message}`);
  }

  return clone;
}

export default {
  updateConfig,
  updatePromptSection,
  updateThreshold,
  setConfigActive,
  createConfig,
  deleteConfig,
  getConfigHistory,
  bulkUpdateConfigs,
  cloneConfig,
};

/**
 * Configuration Loader
 *
 * Loads configurations from the database with in-memory caching.
 * Caches are invalidated after a configurable TTL (default: 5 minutes).
 */

import { supabase } from '../utils/supabase-client.js';

// Cache storage
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes default

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {any} value - The cached value
 * @property {number} timestamp - When the cache was set
 * @property {number} ttl - TTL for this specific entry
 */

/**
 * Check if a cache entry is still valid
 * @param {CacheEntry} entry - The cache entry to check
 * @returns {boolean}
 */
function isCacheValid(entry) {
  if (!entry) return false;
  return Date.now() - entry.timestamp < entry.ttl;
}

/**
 * Get a single configuration value by key
 * @param {string} key - The config key to fetch
 * @param {Object} options - Options
 * @param {boolean} options.bypassCache - Skip cache and fetch fresh
 * @param {number} options.ttl - Custom TTL for this entry
 * @returns {Promise<any>} The config value (config_value.value if exists, or full config_value)
 */
export async function getConfig(key, options = {}) {
  const { bypassCache = false, ttl = CACHE_TTL_MS } = options;
  const cacheKey = `config:${key}`;

  // Check cache first
  if (!bypassCache) {
    const cached = cache.get(cacheKey);
    if (isCacheValid(cached)) {
      return cached.value;
    }
  }

  // Fetch from database
  const { data, error } = await supabase.rpc('get_config', { p_key: key });

  if (error) {
    console.error(`Error fetching config "${key}":`, error.message);
    // Return cached value even if expired, as fallback
    const cached = cache.get(cacheKey);
    if (cached) {
      console.warn(`Using stale cache for "${key}"`);
      return cached.value;
    }
    return null;
  }

  // Extract the actual value (most configs have a 'value' property)
  const value = data?.value !== undefined ? data.value : data;

  // Update cache
  cache.set(cacheKey, {
    value,
    timestamp: Date.now(),
    ttl,
  });

  return value;
}

/**
 * Get full config object (including metadata)
 * @param {string} key - The config key to fetch
 * @returns {Promise<Object|null>} Full config row
 */
export async function getConfigFull(key) {
  const { data, error } = await supabase
    .from('configurations')
    .select('*')
    .eq('config_key', key)
    .eq('is_active', true)
    .single();

  if (error) {
    console.error(`Error fetching full config "${key}":`, error.message);
    return null;
  }

  return data;
}

/**
 * Get all configurations of a specific type
 * @param {string} type - The config type (prompt_section, system, threshold, feature_flag)
 * @param {Object} options - Options
 * @param {boolean} options.bypassCache - Skip cache
 * @returns {Promise<Array>} Array of config objects
 */
export async function getConfigsByType(type, options = {}) {
  const { bypassCache = false } = options;
  const cacheKey = `configs_type:${type}`;

  // Check cache first
  if (!bypassCache) {
    const cached = cache.get(cacheKey);
    if (isCacheValid(cached)) {
      return cached.value;
    }
  }

  // Fetch from database
  const { data, error } = await supabase.rpc('get_configs_by_type', { p_type: type });

  if (error) {
    console.error(`Error fetching configs by type "${type}":`, error.message);
    return [];
  }

  // Update cache
  cache.set(cacheKey, {
    value: data || [],
    timestamp: Date.now(),
    ttl: CACHE_TTL_MS,
  });

  return data || [];
}

/**
 * Get all prompt sections in order
 * @param {Object} options - Options
 * @param {boolean} options.bypassCache - Skip cache
 * @returns {Promise<Array>} Array of prompt section configs
 */
export async function getPromptSections(options = {}) {
  return getConfigsByType('prompt_section', options);
}

/**
 * Get all system configurations
 * @returns {Promise<Object>} Object with config keys as properties
 */
export async function getSystemConfigs() {
  const configs = await getConfigsByType('system');

  // Convert array to object for easier access
  const result = {};
  for (const config of configs) {
    result[config.config_key] = config.config_value;
  }

  return result;
}

/**
 * Get all threshold configurations
 * @returns {Promise<Object>} Object with threshold keys and their values
 */
export async function getThresholds() {
  const configs = await getConfigsByType('threshold');

  const result = {};
  for (const config of configs) {
    // Extract the numeric value from the config_value
    const value = config.config_value?.value;
    result[config.config_key] = value;
  }

  return result;
}

/**
 * Get the similarity threshold for duplicate detection
 * @returns {Promise<number>}
 */
export async function getSimilarityThreshold() {
  const value = await getConfig('similarity_threshold');
  return value ?? 0.85; // Fallback to default
}

/**
 * Get the company cooldown days
 * @returns {Promise<number>}
 */
export async function getCompanyCooldownDays() {
  const value = await getConfig('company_cooldown_days');
  return value ?? 60; // Fallback to default
}

/**
 * Get the Groq model to use
 * @returns {Promise<string>}
 */
export async function getGroqModel() {
  const value = await getConfig('groq_model');
  return value ?? 'llama-3.3-70b-versatile'; // Fallback to default
}

/**
 * Get the max tokens for Groq
 * @returns {Promise<number>}
 */
export async function getGroqMaxTokens() {
  const value = await getConfig('groq_max_tokens');
  return value ?? 4000; // Fallback to default
}

/**
 * Get chart color palettes
 * @returns {Promise<Object>}
 */
export async function getChartColorPalettes() {
  const config = await getConfig('chart_color_palettes', { bypassCache: false });

  // If config is the full object (not extracted value), use it directly
  if (config && typeof config === 'object' && !config.value) {
    return config;
  }

  // Fallback defaults
  return {
    default: ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'],
    cool: ['#3B82F6', '#06B6D4', '#8B5CF6', '#6366F1', '#0EA5E9', '#7C3AED'],
    warm: ['#F59E0B', '#EF4444', '#EC4899', '#F97316', '#DC2626', '#DB2777'],
    business: ['#1E40AF', '#047857', '#B45309', '#7C2D12', '#5B21B6', '#BE185D'],
  };
}

/**
 * Clear the entire cache
 */
export function clearCache() {
  cache.clear();
  console.log('Config cache cleared');
}

/**
 * Clear a specific cache entry
 * @param {string} key - The config key to clear
 */
export function clearCacheKey(key) {
  cache.delete(`config:${key}`);
  cache.delete(`configs_type:${key}`);
}

/**
 * Get cache stats for debugging
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  const stats = {
    size: cache.size,
    entries: [],
  };

  for (const [key, entry] of cache.entries()) {
    stats.entries.push({
      key,
      age: Date.now() - entry.timestamp,
      ttl: entry.ttl,
      isValid: isCacheValid(entry),
    });
  }

  return stats;
}

/**
 * Preload common configs into cache
 * Call this at startup for better performance
 */
export async function preloadConfigs() {
  console.log('Preloading configurations...');

  try {
    // Load all types in parallel
    await Promise.all([
      getConfigsByType('prompt_section'),
      getConfigsByType('system'),
      getConfigsByType('threshold'),
    ]);

    console.log(`Preloaded ${cache.size} config entries`);
  } catch (error) {
    console.error('Failed to preload configs:', error.message);
  }
}

export default {
  getConfig,
  getConfigFull,
  getConfigsByType,
  getPromptSections,
  getSystemConfigs,
  getThresholds,
  getSimilarityThreshold,
  getCompanyCooldownDays,
  getGroqModel,
  getGroqMaxTokens,
  getChartColorPalettes,
  clearCache,
  clearCacheKey,
  getCacheStats,
  preloadConfigs,
};

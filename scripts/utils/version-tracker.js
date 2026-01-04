/**
 * Version Tracker
 *
 * Handles version tracking for case studies, including:
 * - Creating version snapshots
 * - Soft delete/restore
 * - Version history retrieval
 * - Automatic pruning to 5 versions
 */

import { supabase } from './supabase-client.js';

/**
 * Change types for version tracking
 */
export const ChangeTypes = {
  CONTENT: 'content',
  METADATA: 'metadata',
  VISUALS: 'visuals',
  FULL_REGENERATE: 'full_regenerate',
  SOFT_DELETE: 'soft_delete',
  RESTORE: 'restore',
};

/**
 * Content fields that trigger 'content' change type
 */
const CONTENT_FIELDS = [
  'title',
  'the_question',
  'what_happened',
  'mental_model',
  'answer_approach',
  'pushback_scenarios',
  'summary',
  'interviewer_evaluation',
  'common_mistakes',
  'practice',
];

/**
 * Metadata fields that trigger 'metadata' change type
 */
const METADATA_FIELDS = [
  'difficulty',
  'question_type',
  'seniority_level',
  'frameworks_applicable',
  'tags',
  'asked_in_company',
  'industry',
  'company_name',
];

/**
 * Visual fields that trigger 'visuals' change type
 */
const VISUAL_FIELDS = ['charts', 'image_prompt', 'image_generation_status'];

/**
 * Create a version record for a case study update
 * Uses the database function for atomic operation with auto-pruning
 *
 * @param {string} caseId - The case study UUID
 * @param {string} changeType - Type of change (from ChangeTypes)
 * @param {string[]} changedFields - Array of field names that changed
 * @param {string} changeReason - Reason for the change
 * @param {Object} previousValues - Previous values of changed fields
 * @param {Object} newValues - New values of changed fields
 * @param {string} createdBy - Who made the change
 * @returns {Promise<string>} The new version ID
 */
export async function createVersion(
  caseId,
  changeType,
  changedFields,
  changeReason,
  previousValues,
  newValues,
  createdBy = 'system'
) {
  try {
    // Use the database function for atomic operation
    const { data, error } = await supabase.rpc('create_case_version', {
      p_case_id: caseId,
      p_change_type: changeType,
      p_changed_fields: changedFields,
      p_change_reason: changeReason || null,
      p_previous_values: previousValues,
      p_new_values: newValues,
      p_created_by: createdBy,
    });

    if (error) throw error;

    return data; // Returns the new version UUID
  } catch (error) {
    console.error('Error creating version:', error.message);

    // Fallback to manual insert if RPC fails
    return createVersionManual(
      caseId,
      changeType,
      changedFields,
      changeReason,
      previousValues,
      newValues,
      createdBy
    );
  }
}

/**
 * Manual version creation (fallback if RPC unavailable)
 */
async function createVersionManual(
  caseId,
  changeType,
  changedFields,
  changeReason,
  previousValues,
  newValues,
  createdBy
) {
  // Get next version number
  const { data: versions } = await supabase
    .from('case_study_versions')
    .select('version_number')
    .eq('case_study_id', caseId)
    .order('version_number', { ascending: false })
    .limit(1);

  const nextVersion = (versions?.[0]?.version_number || 0) + 1;

  // Insert new version
  const { data, error } = await supabase
    .from('case_study_versions')
    .insert({
      case_study_id: caseId,
      version_number: nextVersion,
      change_type: changeType,
      changed_fields: changedFields,
      change_reason: changeReason,
      previous_values: previousValues,
      new_values: newValues,
      created_by: createdBy,
    })
    .select('id')
    .single();

  if (error) throw error;

  // Update case study's current version
  await supabase
    .from('case_studies')
    .update({ current_version: nextVersion })
    .eq('id', caseId);

  // Prune old versions (keep only 5)
  await pruneVersions(caseId);

  return data.id;
}

/**
 * Prune old versions, keeping only the most recent 5
 * @param {string} caseId - The case study UUID
 */
async function pruneVersions(caseId) {
  const { data: versions } = await supabase
    .from('case_study_versions')
    .select('id, version_number')
    .eq('case_study_id', caseId)
    .order('version_number', { ascending: false });

  if (!versions || versions.length <= 5) return;

  // Delete versions beyond the 5 most recent
  const toDelete = versions.slice(5).map((v) => v.id);

  if (toDelete.length > 0) {
    await supabase.from('case_study_versions').delete().in('id', toDelete);

    console.log(`Pruned ${toDelete.length} old versions for case ${caseId}`);
  }
}

/**
 * Get version history for a case study
 * @param {string} caseId - The case study UUID
 * @param {Object} options - Options
 * @param {number} options.limit - Max versions to return
 * @returns {Promise<Array>} Version history array
 */
export async function getVersionHistory(caseId, options = {}) {
  const { limit = 10 } = options;

  const { data, error } = await supabase
    .from('case_study_versions')
    .select('*')
    .eq('case_study_id', caseId)
    .order('version_number', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching version history:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get a specific version by number
 * @param {string} caseId - The case study UUID
 * @param {number} versionNumber - The version number
 * @returns {Promise<Object|null>}
 */
export async function getVersion(caseId, versionNumber) {
  const { data, error } = await supabase
    .from('case_study_versions')
    .select('*')
    .eq('case_study_id', caseId)
    .eq('version_number', versionNumber)
    .single();

  if (error) {
    console.error('Error fetching version:', error.message);
    return null;
  }

  return data;
}

/**
 * Soft delete a case study
 * @param {string} caseId - The case study UUID
 * @param {string} reason - Reason for deletion
 * @param {string} deletedBy - Who is deleting
 * @returns {Promise<boolean>} Success status
 */
export async function softDeleteCase(caseId, reason = null, deletedBy = 'system') {
  try {
    // Use database function for atomic operation
    const { data, error } = await supabase.rpc('soft_delete_case', {
      p_case_id: caseId,
      p_reason: reason,
      p_deleted_by: deletedBy,
    });

    if (error) throw error;

    return data === true;
  } catch (error) {
    console.error('Error soft deleting case:', error.message);

    // Fallback to manual soft delete
    return softDeleteCaseManual(caseId, reason, deletedBy);
  }
}

/**
 * Manual soft delete (fallback)
 */
async function softDeleteCaseManual(caseId, reason, deletedBy) {
  // Get current case data for version snapshot
  const { data: currentCase, error: fetchError } = await supabase
    .from('case_studies')
    .select('is_published, scheduled_date')
    .eq('id', caseId)
    .is('deleted_at', null)
    .single();

  if (fetchError || !currentCase) {
    console.error('Case not found or already deleted');
    return false;
  }

  // Create version record
  await createVersion(
    caseId,
    ChangeTypes.SOFT_DELETE,
    ['deleted_at', 'deleted_by', 'delete_reason', 'is_published'],
    reason,
    {
      is_published: currentCase.is_published,
      scheduled_date: currentCase.scheduled_date,
    },
    {
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      is_published: false,
    },
    deletedBy
  );

  // Perform soft delete
  const { error } = await supabase
    .from('case_studies')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      delete_reason: reason,
      is_published: false,
    })
    .eq('id', caseId);

  return !error;
}

/**
 * Restore a soft-deleted case study
 * @param {string} caseId - The case study UUID
 * @param {string} restoredBy - Who is restoring
 * @returns {Promise<boolean>} Success status
 */
export async function restoreCase(caseId, restoredBy = 'system') {
  try {
    // Use database function
    const { data, error } = await supabase.rpc('restore_case', {
      p_case_id: caseId,
      p_restored_by: restoredBy,
    });

    if (error) throw error;

    return data === true;
  } catch (error) {
    console.error('Error restoring case:', error.message);

    // Fallback to manual restore
    return restoreCaseManual(caseId, restoredBy);
  }
}

/**
 * Manual restore (fallback)
 */
async function restoreCaseManual(caseId, restoredBy) {
  // Get current (deleted) case data
  const { data: currentCase, error: fetchError } = await supabase
    .from('case_studies')
    .select('deleted_at, deleted_by, delete_reason')
    .eq('id', caseId)
    .not('deleted_at', 'is', null)
    .single();

  if (fetchError || !currentCase) {
    console.error('Case not found or not deleted');
    return false;
  }

  // Create version record
  await createVersion(
    caseId,
    ChangeTypes.RESTORE,
    ['deleted_at', 'deleted_by', 'delete_reason'],
    'Restored from soft delete',
    {
      deleted_at: currentCase.deleted_at,
      deleted_by: currentCase.deleted_by,
      delete_reason: currentCase.delete_reason,
    },
    {
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
    },
    restoredBy
  );

  // Perform restore
  const { error } = await supabase
    .from('case_studies')
    .update({
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
    })
    .eq('id', caseId);

  return !error;
}

/**
 * Determine the change type based on which fields changed
 * @param {string[]} changedFields - Array of field names that changed
 * @returns {string} The change type
 */
export function determineChangeType(changedFields) {
  const hasContent = changedFields.some((f) => CONTENT_FIELDS.includes(f));
  const hasMetadata = changedFields.some((f) => METADATA_FIELDS.includes(f));
  const hasVisuals = changedFields.some((f) => VISUAL_FIELDS.includes(f));

  // If visual fields changed, it's a visuals update
  if (hasVisuals && !hasContent && !hasMetadata) {
    return ChangeTypes.VISUALS;
  }

  // If only metadata changed, it's a metadata update
  if (hasMetadata && !hasContent && !hasVisuals) {
    return ChangeTypes.METADATA;
  }

  // If content changed, it's a content update
  if (hasContent) {
    return ChangeTypes.CONTENT;
  }

  // Default to content for anything else
  return ChangeTypes.CONTENT;
}

/**
 * Compare two objects and return the changed fields
 * @param {Object} oldObj - The old object
 * @param {Object} newObj - The new object
 * @param {string[]} fieldsToCheck - Which fields to check
 * @returns {{changedFields: string[], previousValues: Object, newValues: Object}}
 */
export function compareObjects(oldObj, newObj, fieldsToCheck = null) {
  const fields = fieldsToCheck || Object.keys(newObj);
  const changedFields = [];
  const previousValues = {};
  const newValues = {};

  for (const field of fields) {
    const oldVal = oldObj[field];
    const newVal = newObj[field];

    // Compare as JSON strings for deep comparison
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changedFields.push(field);
      previousValues[field] = oldVal;
      newValues[field] = newVal;
    }
  }

  return { changedFields, previousValues, newValues };
}

/**
 * Get deleted cases for potential restoration
 * @param {Object} options - Options
 * @param {number} options.limit - Max cases to return
 * @param {number} options.daysBack - How far back to look
 * @returns {Promise<Array>}
 */
export async function getDeletedCases(options = {}) {
  const { limit = 50, daysBack = 30 } = options;

  const cutoffDate = new Date(
    Date.now() - daysBack * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from('case_studies')
    .select('id, title, company_name, deleted_at, deleted_by, delete_reason')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', cutoffDate)
    .order('deleted_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching deleted cases:', error.message);
    return [];
  }

  return data || [];
}

export default {
  ChangeTypes,
  createVersion,
  getVersionHistory,
  getVersion,
  softDeleteCase,
  restoreCase,
  determineChangeType,
  compareObjects,
  getDeletedCases,
};

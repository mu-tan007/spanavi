import { supabase } from './supabase';

const BATCH_SIZE = 300;

/** 重複チェック: import行をサーバーで既存データと照合 */
export async function checkDuplicates(mappedRows) {
  const results = { newRows: [], updateRows: [], skipRows: [] };
  const matchMap = new Map(); // row_index -> {existing_id, existing_field_count}

  // Batch the RPC calls
  for (let i = 0; i < mappedRows.length; i += BATCH_SIZE) {
    const batch = mappedRows.slice(i, i + BATCH_SIZE).map((row, idx) => ({
      row_index: i + idx,
      company_name: row.company_name || '',
      representative: row.representative || '',
    }));

    const { data, error } = await supabase.rpc('match_company_duplicates', { p_rows: batch });
    if (error) throw error;
    for (const match of (data || [])) {
      matchMap.set(match.row_index, match);
    }
  }

  // Classify each row
  for (let i = 0; i < mappedRows.length; i++) {
    const row = mappedRows[i];
    const match = matchMap.get(i);
    if (!match) {
      results.newRows.push(row);
    } else {
      const importFieldCount = countFields(row);
      if (importFieldCount > match.existing_field_count) {
        results.updateRows.push({ ...row, id: match.existing_id, existingName: match.existing_name });
      } else {
        results.skipRows.push({ ...row, existingName: match.existing_name, existingRep: match.existing_representative });
      }
    }
  }

  return results;
}

/** インポート実行 */
export async function executeImport(newRows, updateRows, sourceFile, onProgress) {
  let totalInserted = 0, totalUpdated = 0;
  const allInserts = newRows.map(r => ({ ...r, source_file: sourceFile }));
  const allUpdates = updateRows.map(r => {
    const { existingName, ...rest } = r;
    return { ...rest, source_file: sourceFile };
  });

  const totalBatches = Math.ceil(allInserts.length / BATCH_SIZE) + Math.ceil(allUpdates.length / BATCH_SIZE);
  let completedBatches = 0;

  // Insert batches
  for (let i = 0; i < allInserts.length; i += BATCH_SIZE) {
    const batch = allInserts.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.rpc('import_company_master_batch', {
      p_inserts: batch, p_updates: [],
    });
    if (error) throw error;
    totalInserted += data?.inserted || 0;
    completedBatches++;
    onProgress?.({ completedBatches, totalBatches, totalInserted, totalUpdated });
  }

  // Update batches
  for (let i = 0; i < allUpdates.length; i += BATCH_SIZE) {
    const batch = allUpdates.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.rpc('import_company_master_batch', {
      p_inserts: [], p_updates: batch,
    });
    if (error) throw error;
    totalUpdated += data?.updated || 0;
    completedBatches++;
    onProgress?.({ completedBatches, totalBatches, totalInserted, totalUpdated });
  }

  return { totalInserted, totalUpdated };
}

function countFields(row) {
  let count = 0;
  for (const [k, v] of Object.entries(row)) {
    if (k === 'id' || k === 'existingName') continue;
    if (v != null && v !== '') count++;
  }
  return count;
}

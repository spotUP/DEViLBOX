// Modland file detection during import (server-side hash lookup)

import { hashFile } from '../modland/ModlandHasher';
import { lookupFileByHash } from '../modlandApi';
import { extractMetadata } from '../modland/ModlandMetadata';
import { notify } from '@/stores/useNotificationStore';
import { extractPatternsFromLibOpenMPT, hashPatterns } from '../modland/PatternHasher';
import type { ChiptuneMetadata } from '../import/ChiptunePlayer';

export interface ModlandCheckResult {
  found: boolean;
  hash?: string;
  patternHash?: string; // bigint as string
  metadata?: ReturnType<typeof extractMetadata>;
  sample_count?: number;
}

/**
 * Check if imported file exists in Modland database via server API
 * If found, show metadata notification
 * If not found, return result so caller can show contribution prompt
 * 
 * @param file The file to check
 * @param libopenmptMeta Optional metadata from libopenmpt (for pattern hash computation)
 */
export async function checkModlandFile(
  file: File,
  libopenmptMeta?: ChiptuneMetadata | null
): Promise<ModlandCheckResult> {
  try {
    // Hash the file (50-200ms)
    const hash = await hashFile(file);
    
    // Compute pattern hash if we have libopenmpt metadata
    let patternHash: string | undefined;
    if (libopenmptMeta?.song) {
      try {
        const patternData = extractPatternsFromLibOpenMPT(libopenmptMeta.song);
        const hashBigInt = hashPatterns(patternData);
        patternHash = hashBigInt.toString();
        console.log('[Modland] Computed pattern hash:', patternHash);
      } catch (error) {
        console.warn('[Modland] Failed to compute pattern hash:', error);
      }
    }
    
    // Query server API (non-blocking)
    const result = await lookupFileByHash(hash);
    
    if (result.match && result.file) {
      const metadata = extractMetadata(result.file);
      
      // Show notification with Modland metadata
      const sampleInfo = result.sample_count ? ` • ${result.sample_count} samples` : '';
      notify.info(
        `✓ Verified Modland File: ${metadata.title} by ${metadata.artist} (${metadata.format})${sampleInfo}`
      );
      
      console.log('✅ Modland file verified:', {
        hash,
        patternHash,
        metadata,
        url: result.file.url,
        samples: result.sample_count
      });

      return { 
        found: true, 
        hash, 
        patternHash,
        metadata, 
        sample_count: result.sample_count 
      };
    }
    
    // File not in Modland - return hash for contribution prompt
    return { found: false, hash, patternHash };
  } catch (error) {
    // Silently fail - don't block import if Modland check fails
    console.debug('[Modland] Hash check failed:', error);
    return { found: false };
  }
}

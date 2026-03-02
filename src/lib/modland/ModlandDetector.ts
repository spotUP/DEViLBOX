// Modland file detection during import (server-side hash lookup)

import { hashFile } from '../modland/ModlandHasher';
import { lookupFileByHash } from '../modlandApi';
import { extractMetadata } from '../modland/ModlandMetadata';
import { notify } from '@/stores/useNotificationStore';

export interface ModlandCheckResult {
  found: boolean;
  hash?: string;
  metadata?: ReturnType<typeof extractMetadata>;
  sample_count?: number;
}

/**
 * Check if imported file exists in Modland database via server API
 * If found, show metadata notification
 * If not found, return result so caller can show contribution prompt
 */
export async function checkModlandFile(file: File): Promise<ModlandCheckResult> {
  try {
    // Hash the file (50-200ms)
    const hash = await hashFile(file);
    
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
        metadata,
        url: result.file.url,
        samples: result.sample_count
      });

      return { found: true, hash, metadata, sample_count: result.sample_count };
    }
    
    // File not in Modland - return hash for contribution prompt
    return { found: false, hash };
  } catch (error) {
    // Silently fail - don't block import if Modland check fails
    console.debug('[Modland] Hash check failed:', error);
    return { found: false };
  }
}

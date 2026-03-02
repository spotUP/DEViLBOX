// Modland file detection during import

import { hashFile } from '../modland/ModlandHasher';
import { modlandService } from '../modland/ModlandService';
import { extractMetadata } from '../modland/ModlandMetadata';
import { notify } from '@/stores/useNotificationStore';

/**
 * Check if imported file exists in Modland database
 * If found, show metadata notification
 */
export async function checkModlandFile(file: File): Promise<void> {
  try {
    // Skip if database not initialized
    if (!modlandService.isLoaded()) {
      // Try to init in background (won't block import)
      modlandService.init().catch(() => {});
      return;
    }

    // Hash the file
    const hash = await hashFile(file);
    
    // Query Modland database
    const modlandFile = await modlandService.findByHash(hash);
    
    if (modlandFile) {
      const metadata = extractMetadata(modlandFile);
      
      // Show notification with Modland metadata
      notify.info(
        `📦 Modland Archive File Detected`,
        `${metadata.title} by ${metadata.artist} (${metadata.format})`,
        5000
      );
      
      console.log('✅ Modland file detected:', {
        hash,
        metadata,
        url: modlandFile.url
      });
    }
  } catch (error) {
    // Silently fail - don't block import if Modland check fails
    console.debug('[Modland] Hash check failed:', error);
  }
}

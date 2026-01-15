/**
 * Effect System Module Exports
 *
 * Format-aware effect processing for tracker module playback
 */

// Types
export * from './types';

// Period tables and utilities
export * from './PeriodTables';

// Base handler
export { BaseFormatHandler, EffectTiming, EFFECT_TIMINGS } from './FormatHandler';

// Format-specific handlers
export { MODHandler } from './MODHandler';
export { XMHandler } from './XMHandler';
export { S3MHandler } from './S3MHandler';

// Factory function to get appropriate handler for a format
import { type ModuleFormat, type FormatHandler } from './types';
import { MODHandler } from './MODHandler';
import { XMHandler } from './XMHandler';
import { S3MHandler } from './S3MHandler';

/**
 * Create an effect handler for the specified format
 */
export function createFormatHandler(format: ModuleFormat): FormatHandler {
  switch (format) {
    case 'MOD':
      return new MODHandler();
    case 'XM':
      return new XMHandler();
    case 'S3M':
    case 'IT':
      return new S3MHandler(); // IT uses similar effects to S3M
    case 'NATIVE':
    default:
      return new XMHandler(); // Default to XM-style for native format
  }
}

/**
 * Detect module format from file extension
 */
export function detectFormatFromExtension(filename: string): ModuleFormat {
  const ext = filename.toLowerCase().split('.').pop();

  switch (ext) {
    case 'mod':
      return 'MOD';
    case 'xm':
      return 'XM';
    case 's3m':
      return 'S3M';
    case 'it':
      return 'IT';
    default:
      return 'NATIVE';
  }
}

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
export { ITHandler } from './ITHandler';

// Factory function to get appropriate handler for a format
import { type ModuleFormat, type FormatHandler } from './types';
import { MODHandler } from './MODHandler';
import { XMHandler } from './XMHandler';
import { S3MHandler } from './S3MHandler';
import { ITHandler } from './ITHandler';

/**
 * Create an effect handler for the specified format
 */
export function createFormatHandler(format: ModuleFormat): FormatHandler {
  switch (format) {
    case 'MOD':
    case 'PT36':
    case 'SFX':
      return new MODHandler();
    case 'XM':
    case 'DBM': // DigiBooster Pro is XM-like
      return new XMHandler();
    case 'S3M':
    case 'STM':
    case 'STX':
    case '669':
    case 'FAR':
    case 'ULT':
    case 'MTM':
      return new S3MHandler();
    case 'IT':
      return new ITHandler();
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
    case 'm15':
    case 'stk':
    case 'stp':
      return 'MOD';
    case 'xm':
      return 'XM';
    case 's3m':
      return 'S3M';
    case 'it':
    case 'mptm':
      return 'IT';
    case 'dbm':
      return 'DBM';
    case 'digi':
      return 'DIGI';
    case 'mtm':
      return 'MTM';
    case 'med':
      return 'MED';
    case 'okt':
      return 'OKT';
    case '669':
      return '669';
    case 'stm':
      return 'STM';
    case 'stx':
      return 'STX';
    case 'pt36':
      return 'PT36';
    case 'sfx':
    case 'sfx2':
    case 'mms':
      return 'SFX';
    default:
      return 'NATIVE';
  }
}

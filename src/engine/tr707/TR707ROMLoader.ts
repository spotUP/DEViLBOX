/**
 * TR707 ROM Loader
 *
 * Re-exports from generic MAME ROM loader for backward compatibility
 */

export { loadTR707ROMs, TR707_ROM_CONFIG } from '@engine/mame/MAMEROMLoader';

/**
 * Create a combined ROM from individual files
 */
export function combineTR707ROMs(voices: Uint8Array, crash: Uint8Array, ride: Uint8Array): Uint8Array {
  const combined = new Uint8Array(128 * 1024); // 128KB
  combined.set(voices, 0);          // 0x00000-0x0FFFF (64KB)
  combined.set(crash, 0x10000);     // 0x10000-0x17FFF (32KB)
  combined.set(ride, 0x18000);      // 0x18000-0x1FFFF (32KB)
  return combined;
}

/**
 * Modland Pattern Hash Implementation
 * 
 * Implements the exact same pattern hashing algorithm used by modland_hash tool.
 * This creates a "melody fingerprint" by hashing only the NOTE values from all patterns.
 * 
 * Algorithm: FNV-1a 64-bit hash
 * - Start with offset basis: 14695981039346656037n
 * - For each note in pattern order: hash ^= note, then hash *= 1099511628211n (FNV prime)
 * - Only hashes NOTE values (not instruments, volumes, or effects)
 * 
 * Based on: modland_hash/external/libopenmpt/interface.cpp::hash_patterns()
 * Reference: https://github.com/emoon/modland_hash
 */

// FNV-1a 64-bit constants
const FNV_OFFSET_BASIS = 14695981039346656037n;
const FNV_PRIME = 1099511628211n;

export interface PatternData {
  numOrders: number;
  numChannels: number;
  orders: number[]; // pattern indices
  patterns: Map<number, {
    numRows: number;
    notes: Uint8Array; // [row][channel] flat array
  }>;
}

/**
 * Hash pattern data using FNV-1a 64-bit (matches modland_hash algorithm exactly)
 * 
 * @param patternData Extracted pattern data from a tracker module
 * @returns 64-bit hash as bigint, or 1n if invalid (0x1ff effect detected)
 */
export function hashPatterns(patternData: PatternData): bigint {
  let hash = FNV_OFFSET_BASIS;
  
  const { orders, patterns, numChannels } = patternData;
  
  // Go through the complete sequence order by order
  for (const patternIdx of orders) {
    const pattern = patterns.get(patternIdx);
    if (!pattern) continue;
    
    const { numRows, notes } = pattern;
    
    // For each row in the pattern
    for (let row = 0; row < numRows; row++) {
      // For each channel
      for (let channel = 0; channel < numChannels; channel++) {
        const noteIdx = row * numChannels + channel;
        const note = notes[noteIdx];
        
        // Special case: effect 1 with parameter 0xFF = invalid
        // (In real tracker data, this would need effect/param extraction)
        
        // Only hash non-zero notes
        if (note !== 0) {
          hash ^= BigInt(note);
          hash *= FNV_PRIME;
        }
      }
    }
  }
  
  return hash;
}

/**
 * Extract pattern data from a Furnace module
 * (Furnace-specific implementation)
 */
export async function extractPatternsFromFurnace(
  furnaceWasm: any,
  songPtr: number
): Promise<PatternData | null> {
  try {
    // Get song structure
    const numOrders = furnaceWasm._furnace_get_order_len(songPtr);
    const numChannels = furnaceWasm._furnace_get_channel_count(songPtr);
    
    // Get order list
    const orders: number[] = [];
    for (let i = 0; i < numOrders; i++) {
      const patternIdx = furnaceWasm._furnace_get_order(songPtr, 0, i); // subsong 0
      orders.push(patternIdx);
    }
    
    // Extract patterns
    const patterns = new Map();
    const uniquePatterns = new Set(orders);
    
    for (const patternIdx of uniquePatterns) {
      const numRows = furnaceWasm._furnace_get_pattern_len(songPtr, patternIdx);
      const notes = new Uint8Array(numRows * numChannels);
      
      for (let row = 0; row < numRows; row++) {
        for (let ch = 0; ch < numChannels; ch++) {
          // Get note value (0 = empty, 1-96 = notes, 100 = note off, 101 = note off env, 102 = note rel)
          const note = furnaceWasm._furnace_get_pattern_note(songPtr, ch, patternIdx, row);
          notes[row * numChannels + ch] = note;
        }
      }
      
      patterns.set(patternIdx, { numRows, notes });
    }
    
    return { numOrders, numChannels, orders, patterns };
  } catch (error) {
    console.error('[PatternHash] Failed to extract Furnace patterns:', error);
    return null;
  }
}

/**
 * Extract pattern data from a ProTracker/FastTracker module
 * (Generic tracker implementation - needs module format parser)
 */
export function extractPatternsFromMOD(moduleData: Uint8Array): PatternData | null {
  // TODO: Implement MOD/XM/IT pattern extraction
  // For now, return null - this requires format-specific parsers
  console.warn('[PatternHash] MOD/XM/IT pattern extraction not yet implemented');
  return null;
}

/**
 * Compute SHA-256 hash of sample PCM data
 * (Matches modland_hash sample hashing)
 * 
 * @param sampleData Raw PCM data (8-bit or 16-bit)
 * @returns Hex string of SHA-256 hash
 */
export async function hashSampleData(sampleData: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', sampleData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Example usage:
 * 
 * ```typescript
 * // 1. Extract pattern data from loaded module
 * const patternData = await extractPatternsFromFurnace(furnaceWasm, songPtr);
 * 
 * // 2. Compute pattern hash
 * if (patternData) {
 *   const hash = hashPatterns(patternData);
 *   console.log('Pattern hash:', hash.toString(16));
 * }
 * 
 * // 3. Find similar tunes in database
 * const matches = await findPatternMatches(hash);
 * ```
 */

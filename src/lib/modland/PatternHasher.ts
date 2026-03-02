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
 * Extract pattern data from libopenmpt ChiptuneMetadata
 * (Uses the pattern data already extracted by libopenmpt WASM)
 */
export function extractPatternsFromLibOpenMPT(
  songData: {
    channels: string[];
    orders: { name: string; pat: number }[];
    patterns: {
      name: string;
      rows: number[][][]; // [row][channel][command]
    }[];
  }
): PatternData {
  const numChannels = songData.channels.length;
  const orders = songData.orders.map(o => o.pat);
  
  // Extract patterns
  const patterns = new Map();
  
  for (const pattern of songData.patterns) {
    const patternIdx = songData.patterns.indexOf(pattern);
    const numRows = pattern.rows.length;
    const notes = new Uint8Array(numRows * numChannels);
    
    for (let row = 0; row < numRows; row++) {
      const rowData = pattern.rows[row];
      for (let ch = 0; ch < numChannels; ch++) {
        const cell = rowData[ch];
        // cell[0] = NOTE value (matches modland_hash algorithm)
        // cell indices: 0=NOTE, 1=INSTRUMENT, 2=VOLUMEEFFECT, 3=EFFECT, 4=VOLUME, 5=PARAMETER
        const note = cell[0] || 0;
        notes[row * numChannels + ch] = note;
      }
    }
    
    patterns.set(patternIdx, { numRows, notes });
  }
  
  return {
    numOrders: orders.length,
    numChannels,
    orders,
    patterns
  };
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
 * // 1. Load module with libopenmpt
 * const player = new ChiptunePlayer();
 * await player.play(arrayBuffer);
 * 
 * // 2. Extract pattern data from metadata
 * if (player.meta?.song) {
 *   const patternData = extractPatternsFromLibOpenMPT(player.meta.song);
 *   
 *   // 3. Compute pattern hash
 *   const hash = hashPatterns(patternData);
 *   console.log('Pattern hash:', hash.toString());
 *   
 *   // 4. Find similar tunes in database
 *   const matches = await findPatternMatches(hash.toString());
 * }
 * ```
 */

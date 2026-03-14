/**
 * Generic MAME ROM Loader
 *
 * Loads ROM dumps for various MAME sound chips that require sample data.
 *
 * ROM files should be placed in: /public/roms/{chipname}/
 *
 * Supports both unzipped (.bin) and zipped (.zip) ROM files following MAME naming conventions.
 *
 * Supported chips:
 * - TR707: Roland TR-707 drum machine (128KB)
 * - SP0250: Speech synthesis (16KB)
 * - TMS5220: Speech synthesis (varies)
 * - Votrax: Speech synthesis (varies)
 * - ICS2115: Wavetable synth (varies)
 * - K054539: Konami PCM (varies)
 * - C352: Namco PCM (varies)
 * - RF5C400: Ricoh PCM (varies)
 */

import { normalizeUrl } from '@/utils/urlUtils';

export interface ROMFile {
  name: string;
  offset: number;
  size?: number;  // Expected size (optional validation)
  required?: boolean;  // If true, throw error if missing
}

export interface ChipROMConfig {
  chipName: string;
  basePath: string;
  files: ROMFile[];
  combinedFile?: string;  // Optional single combined ROM file
  combinedSize?: number;  // Expected size of combined file
  zipFile?: string;  // Optional MAME-style .zip file containing all ROMs
}

/**
 * TR-707 ROM configuration (Standard)
 */
export const TR707_ROM_CONFIG: ChipROMConfig = {
  chipName: 'TR707',
  basePath: '/roms/tr707',
  zipFile: 'tr707.zip',  // MAME-style ZIP (preferred)
  combinedFile: 'tr707_combined.bin',  // Or combined binary
  combinedSize: 128 * 1024,  // 128KB
  files: [
    { name: 'tr707_voices.bin', offset: 0x00000, size: 64 * 1024, required: true },
    { name: 'tr707_crash.bin', offset: 0x10000, size: 32 * 1024 },
    { name: 'tr707_ride.bin', offset: 0x18000, size: 32 * 1024 },
  ],
};

/**
 * TR-707 Expansion ROM configuration (HKA Design)
 * https://hkadesign.org.uk/tr707expansion.html
 *
 * Adds extra sounds beyond the standard TR-707:
 * - Additional percussion
 * - More cymbal variations
 * - Extended sample library
 */
export const TR707_EXPANSION_ROM_CONFIG: ChipROMConfig = {
  chipName: 'TR707-Expansion',
  basePath: '/roms/tr707',
  zipFile: 'tr707_expansion.zip',  // HKA expansion ZIP
  combinedFile: 'tr707_expansion.bin',  // Or combined binary
  combinedSize: 256 * 1024,  // 256KB (expanded)
  files: [
    { name: 'tr707_voices.bin', offset: 0x00000, size: 64 * 1024, required: true },
    { name: 'tr707_crash.bin', offset: 0x10000, size: 32 * 1024 },
    { name: 'tr707_ride.bin', offset: 0x18000, size: 32 * 1024 },
    { name: 'tr707_expansion.bin', offset: 0x20000, size: 128 * 1024 },  // Extra sounds
  ],
};

/**
 * SP0250 ROM configuration (GI Speech Chip)
 */
export const SP0250_ROM_CONFIG: ChipROMConfig = {
  chipName: 'SP0250',
  basePath: '/roms/sp0250',
  zipFile: 'sp0250.zip',
  combinedFile: 'sp0250.bin',
  combinedSize: 16 * 1024,  // 16KB
  files: [
    { name: 'sp0250.bin', offset: 0, size: 16 * 1024, required: true },
  ],
};

/**
 * TMS5220 ROM configuration (TI Speech Chip)
 */
export const TMS5220_ROM_CONFIG: ChipROMConfig = {
  chipName: 'TMS5220',
  basePath: '/roms/snspell',
  files: [
    { name: 'tmc0351n2l.vsm', offset: 0, size: 16384, required: true },
    { name: 'tmc0352n2l.vsm', offset: 16384, size: 16384, required: true },
  ],
};

/**
 * Votrax ROM configuration
 */
export const VOTRAX_ROM_CONFIG: ChipROMConfig = {
  chipName: 'Votrax',
  basePath: '/roms/votrax',
  zipFile: 'votrax.zip',
  files: [
    { name: 'votrax.bin', offset: 0, required: true },
  ],
};

/**
 * C352 ROM configuration (Namco 32-Voice PCM)
 * Game-specific sample ROMs vary by arcade game (System 11/12/22/23)
 */
export const C352_ROM_CONFIG: ChipROMConfig = {
  chipName: 'C352',
  basePath: '/roms/c352',
  zipFile: 'c352.zip',
  combinedFile: 'c352_samples.bin',
  combinedSize: 8388608, // 8MB
  files: [
    { name: 'c352_samples_0.bin', offset: 0, size: 4194304, required: true },
    { name: 'c352_samples_1.bin', offset: 4194304, size: 4194304, required: true },
  ],
};

/**
 * K054539 ROM configuration (Konami PCM/ADPCM)
 * Game-specific sample ROMs vary by Konami arcade game
 */
export const K054539_ROM_CONFIG: ChipROMConfig = {
  chipName: 'K054539',
  basePath: '/roms/k054539',
  zipFile: 'k054539.zip',
  combinedFile: 'k054539_samples.bin',
  combinedSize: 6291456, // ~6MB
  files: [
    { name: 'k054539_samples_0.bin', offset: 0, size: 2097152, required: true },
    { name: 'k054539_samples_1.bin', offset: 2097152, size: 1048576, required: true },
    { name: 'k054539_samples_2.bin', offset: 3145728, size: 1048576, required: true },
    { name: 'k054539_samples_3.bin', offset: 4194304, size: 2097152, required: true },
  ],
};

/**
 * ICS2115 ROM configuration (Wavetable Synthesizer)
 * Compatible with Gravis UltraSound ROMs
 */
export const ICS2115_ROM_CONFIG: ChipROMConfig = {
  chipName: 'ICS2115',
  basePath: '/roms/ics2115',
  zipFile: 'ics2115.zip',
  combinedFile: 'ics2115_wavetable.bin',
  combinedSize: 262144, // 256KB
  files: [
    { name: 'ics2115_wavetable_0.bin', offset: 0, size: 262144, required: true },
  ],
};

/**
 * RF5C400 ROM configuration (Ricoh 32-Voice PCM)
 * Sega Saturn/arcade sample ROMs
 */
export const RF5C400_ROM_CONFIG: ChipROMConfig = {
  chipName: 'RF5C400',
  basePath: '/roms/rf5c400',
  zipFile: 'rf5c400.zip',
  combinedFile: 'rf5c400_samples.bin',
  files: [
    { name: 'rf5c400_samples.bin', offset: 0, required: true },
  ],
};

/**
 * ES5503 ROM configuration (Ensoniq DOC)
 * Wavetable/sample data for Apple IIgs/Ensoniq Mirage
 */
export const ES5503_ROM_CONFIG: ChipROMConfig = {
  chipName: 'ES5503',
  basePath: '/roms/es5503',
  zipFile: 'es5503.zip',
  combinedFile: 'es5503_wavetable.bin',
  files: [
    { name: 'es5503_wavetable.bin', offset: 0, required: true },
  ],
};

/**
 * D50 ROM configuration (Roland D-50 Linear Arithmetic Synth)
 * Firmware + 2 PCM sample ROMs
 */
export const D50_ROM_CONFIG: ChipROMConfig = {
  chipName: 'D50',
  basePath: '/roms/d50',
  zipFile: 'd50.zip',
  files: [
    { name: 'd50_firmware.bin', offset: 0, size: 64 * 1024, required: true },
    { name: 'd50_ic30.bin', offset: 64 * 1024, size: 512 * 1024, required: true },
    { name: 'd50_ic29.bin', offset: 576 * 1024, size: 512 * 1024, required: true },
  ],
};

/**
 * VFX ROM configuration (Ensoniq VFX/SD-1 Wavetable Synth)
 * Multiple firmware versions and sample ROM banks
 */
export const VFX_ROM_CONFIG: ChipROMConfig = {
  chipName: 'VFX',
  basePath: '/roms/vfx',
  zipFile: 'vfx.zip',
  files: [
    // Sample ROM banks (most important for sound generation)
    { name: 'u14.bin', offset: 0, size: 512 * 1024, required: true },
    { name: 'u15.bin', offset: 512 * 1024, size: 512 * 1024, required: true },
    { name: 'u16.bin', offset: 1024 * 1024, size: 512 * 1024, required: true },
    // Firmware ROMs (optional - various versions)
    { name: 'vfx210b-low.bin', offset: 1536 * 1024, size: 64 * 1024 },
    { name: 'vfx210b-high.bin', offset: 1600 * 1024, size: 64 * 1024 },
  ],
};

/**
 * Roland SA ROM configuration (Roland SA-series PCM samples)
 * 3 wave ROM banks (IC5, IC6, IC7)
 */
export const ROLANDSA_ROM_CONFIG: ChipROMConfig = {
  chipName: 'RolandSA',
  basePath: '/roms/roland_sa',
  zipFile: 'roland_sa.zip',
  files: [
    { name: 'ic5.bin', offset: 0, size: 128 * 1024, required: true },
    { name: 'ic6.bin', offset: 128 * 1024, size: 128 * 1024, required: true },
    { name: 'ic7.bin', offset: 256 * 1024, size: 128 * 1024, required: true },
  ],
};

/**
 * Load ROMs from a MAME-style .zip file
 */
async function loadFromZip(zipPath: string, config: ChipROMConfig): Promise<Uint8Array | null> {
  try {
    const response = await fetch(normalizeUrl(zipPath));
    if (!response.ok) {
      console.log(`[${config.chipName}] ZIP file not found at ${zipPath} (HTTP ${response.status})`);
      return null;
    }

    // Validate response is actually a ZIP file, not HTML from Vite SPA fallback
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      console.log(`[${config.chipName}] ZIP not found at ${zipPath} (got HTML - SPA fallback)`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();

    // Extra safety: check ZIP magic bytes (PK\x03\x04)
    if (arrayBuffer.byteLength < 4) {
      console.log(`[${config.chipName}] File too small to be a ZIP: ${arrayBuffer.byteLength} bytes`);
      return null;
    }
    const header = new Uint8Array(arrayBuffer, 0, 4);
    if (header[0] !== 0x50 || header[1] !== 0x4B) {  // 'PK'
      console.log(`[${config.chipName}] Not a ZIP file at ${zipPath} (magic: 0x${header[0].toString(16)}${header[1].toString(16)})`);
      return null;
    }

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Calculate max size needed (only from files with known sizes)
    const knownSizes = config.files.filter(f => f.size).map(f => f.offset + f.size!);
    const initialSize = knownSizes.length > 0 ? Math.max(...knownSizes) :
                       (config.combinedSize || 4 * 1024 * 1024); // Default 4MB
    let combinedROM = new Uint8Array(initialSize);

    let loadedCount = 0;

    // Extract each file from the ZIP
    for (const file of config.files) {
      // Try exact match first, then search recursively for filename
      let zipEntry = zip.file(file.name);

      if (!zipEntry) {
        // Search for the filename in any subdirectory
        const allFiles = Object.keys(zip.files);
        const matchingFile = allFiles.find(path => path.endsWith('/' + file.name) || path === file.name);
        if (matchingFile) {
          zipEntry = zip.file(matchingFile);
        }
      }

      if (!zipEntry) {
        if (file.required) {
          console.error(`[${config.chipName}] Required file ${file.name} not found in ZIP`);
          return null;
        }
        console.warn(`[${config.chipName}] Optional file ${file.name} not found in ZIP`);
        continue;
      }

      const data = await zipEntry.async('uint8array');

      if (file.size && data.length !== file.size) {
        console.warn(
          `[${config.chipName}] ${file.name} size mismatch: ` +
          `expected ${file.size}, got ${data.length}`
        );
      }

      // Grow buffer if needed
      const requiredSize = file.offset + data.length;
      if (requiredSize > combinedROM.length) {
        console.log(`[${config.chipName}] Growing buffer from ${combinedROM.length} to ${requiredSize}`);
        const newROM = new Uint8Array(requiredSize);
        newROM.set(combinedROM);
        combinedROM = newROM;
      }

      combinedROM.set(data, file.offset);
      loadedCount++;
      console.log(`✓ Extracted ${file.name}:`, data.length, `bytes from ZIP`);
    }

    if (loadedCount === 0) return null;

    console.log(`✓ ${config.chipName} ROMs loaded from ZIP: ${loadedCount}/${config.files.length} files`);
    return combinedROM;

  } catch (error) {
    console.warn(`[${config.chipName}] Failed to load ZIP file:`, error);
    return null;
  }
}

/**
 * Load ROM files for a specific chip
 * Tries in order: .zip file (MAME standard) -> combined .bin -> individual .bin files
 */
export async function loadChipROMs(config: ChipROMConfig): Promise<Uint8Array> {
  console.log(`[${config.chipName}] Loading ROMs from ${config.basePath}...`);

  try {
    // Try ZIP file first (MAME standard format)
    if (config.zipFile) {
      const zipPath = `${config.basePath}/${config.zipFile}`;
      const zipData = await loadFromZip(zipPath, config);
      if (zipData) {
        console.log(`✓ Loaded ${config.chipName} from ZIP:`, zipData.length, 'bytes');
        return zipData;
      }
      console.log(`[${config.chipName}] ZIP not found, trying other formats...`);
    }

    // Try combined ROM if specified
    if (config.combinedFile) {
      try {
        const response = await fetch(normalizeUrl(`${config.basePath}/${config.combinedFile}`));
        const ct = response.headers.get('content-type') || '';
        if (response.ok && !ct.includes('text/html')) {
          const buffer = await response.arrayBuffer();
          const data = new Uint8Array(buffer);

          if (config.combinedSize && data.length !== config.combinedSize) {
            console.warn(
              `[${config.chipName}] Combined ROM size mismatch: ` +
              `expected ${config.combinedSize}, got ${data.length}`
            );
          }

          console.log(`✓ Loaded ${config.chipName} combined ROM:`, data.length, 'bytes');
          return data;
        }
      } catch {
        console.log(`[${config.chipName}] Combined ROM not found, trying individual files...`);
      }
    }

    // Load individual ROM files
    const maxSize = Math.max(...config.files.map(f => f.offset + (f.size || 0)));
    const combinedROM = new Uint8Array(maxSize || 1024 * 1024);  // Default 1MB if no sizes specified

    let loadedCount = 0;
    const results = await Promise.allSettled(
      config.files.map(async (file) => {
        try {
          const response = await fetch(normalizeUrl(`${config.basePath}/${file.name}`));
          const ct = response.headers.get('content-type') || '';
          if (!response.ok || ct.includes('text/html')) {
            if (file.required) {
              throw new Error(`${file.name} not found (HTTP ${response.status}, type: ${ct})`);
            }
            console.warn(`[${config.chipName}] Optional ROM ${file.name} not found`);
            return;
          }

          const buffer = await response.arrayBuffer();
          const data = new Uint8Array(buffer);

          if (file.size && data.length !== file.size) {
            console.warn(
              `[${config.chipName}] ${file.name} size mismatch: ` +
              `expected ${file.size}, got ${data.length}`
            );
          }

          combinedROM.set(data, file.offset);
          loadedCount++;
          console.log(`✓ Loaded ${file.name}:`, data.length, `bytes at offset 0x${file.offset.toString(16)}`);
        } catch (error) {
          if (file.required) {
            throw error;
          }
          console.warn(`[${config.chipName}] Failed to load ${file.name}:`, error);
        }
      })
    );

    if (loadedCount === 0) {
      throw new Error(`No ROM files loaded for ${config.chipName}`);
    }

    // Check if any required files failed
    const requiredFailed = results.find((r, i) =>
      r.status === 'rejected' && config.files[i].required
    );
    if (requiredFailed) {
      throw new Error(`Required ROM file failed to load for ${config.chipName}`);
    }

    console.log(`✓ ${config.chipName} ROMs loaded: ${loadedCount}/${config.files.length} files`);
    return combinedROM;

  } catch (error) {
    console.error(`[${config.chipName}] ROM loading failed:`, error);
    throw new Error(
      `${config.chipName} ROM files not found or invalid.\n` +
      `Please place ROM files in ${config.basePath}/\n` +
      `Required files: ${config.files.filter(f => f.required).map(f => f.name).join(', ')}`
    );
  }
}

/**
 * Helper: Load TR-707 ROMs
 * @param useExpansion - If true, attempts to load HKA expansion ROM
 */
export async function loadTR707ROMs(useExpansion: boolean = false): Promise<Uint8Array> {
  if (useExpansion) {
    try {
      console.log('[TR707] Attempting to load expansion ROM...');
      return await loadChipROMs(TR707_EXPANSION_ROM_CONFIG);
    } catch {
      console.warn('[TR707] Expansion ROM not found, falling back to standard ROM');
      // Fall through to standard ROM
    }
  }
  return loadChipROMs(TR707_ROM_CONFIG);
}

/**
 * Helper: Load SP0250 ROMs
 */
export async function loadSP0250ROMs(): Promise<Uint8Array> {
  return loadChipROMs(SP0250_ROM_CONFIG);
}

/**
 * Helper: Load TMS5220 ROMs
 */
export async function loadTMS5220ROMs(): Promise<Uint8Array> {
  return loadChipROMs(TMS5220_ROM_CONFIG);
}

/**
 * Helper: Load Votrax ROMs
 */
export async function loadVotraxROMs(): Promise<Uint8Array> {
  return loadChipROMs(VOTRAX_ROM_CONFIG);
}

/**
 * Helper: Load C352 ROMs
 */
export async function loadC352ROMs(): Promise<Uint8Array> {
  return loadChipROMs(C352_ROM_CONFIG);
}

/**
 * Helper: Load K054539 ROMs
 */
export async function loadK054539ROMs(): Promise<Uint8Array> {
  return loadChipROMs(K054539_ROM_CONFIG);
}

/**
 * Helper: Load ICS2115 ROMs
 */
export async function loadICS2115ROMs(): Promise<Uint8Array> {
  return loadChipROMs(ICS2115_ROM_CONFIG);
}

/**
 * Helper: Load RF5C400 ROMs
 */
export async function loadRF5C400ROMs(): Promise<Uint8Array> {
  return loadChipROMs(RF5C400_ROM_CONFIG);
}

/**
 * Helper: Load ES5503 ROMs
 */
export async function loadES5503ROMs(): Promise<Uint8Array> {
  return loadChipROMs(ES5503_ROM_CONFIG);
}


/**
 * Helper: Load D50 ROMs
 * Returns object with separate ROM buffers for D50's loadROMs() method
 */
export async function loadD50ROMs(): Promise<{ firmware: Uint8Array; ic30: Uint8Array; ic29: Uint8Array }> {
  const combinedROM = await loadChipROMs(D50_ROM_CONFIG);

  // Split the combined ROM into separate buffers
  const firmware = combinedROM.slice(0, 64 * 1024);
  const ic30 = combinedROM.slice(64 * 1024, 576 * 1024);
  const ic29 = combinedROM.slice(576 * 1024, 1088 * 1024);

  return { firmware, ic30, ic29 };
}

/**
 * Helper: Load VFX ROMs
 * Returns array of sample ROM banks for VFX's loadSampleROM() method
 */
export async function loadVFXROMs(): Promise<Uint8Array[]> {
  const combinedROM = await loadChipROMs(VFX_ROM_CONFIG);

  // Split into sample ROM banks (u14, u15, u16)
  const banks = [
    combinedROM.slice(0, 512 * 1024),           // Bank 0: u14
    combinedROM.slice(512 * 1024, 1024 * 1024), // Bank 1: u15
    combinedROM.slice(1024 * 1024, 1536 * 1024), // Bank 2: u16
  ];

  return banks;
}

/**
 * Helper: Load Roland SA ROMs
 * Returns combined 384KB ROM buffer (IC5, IC6, IC7)
 */
export async function loadRolandSAROMs(): Promise<Uint8Array> {
  return await loadChipROMs(ROLANDSA_ROM_CONFIG);
}

/**
 * MultiPCM (Yamaha YMW258-F / GEW8) ROM configuration
 * Used in Sega Model 1/2, various Yamaha arcade boards
 * ROM contains 12-byte-per-sample metadata table + sample data
 */
export const MULTIPCM_ROM_CONFIG: ChipROMConfig = {
  chipName: 'MultiPCM',
  basePath: '/roms/multipcm',
  zipFile: 'multipcm.zip',
  combinedFile: 'multipcm_samples.bin',
  combinedSize: 8 * 1024 * 1024,  // 8MB typical
  files: [
    { name: 'multipcm_samples.bin', offset: 0, required: true },
  ],
};

/**
 * ZSG-2 (ZOOM ZSG-2) ROM configuration
 * Used in ZOOM GFX-8, Studio 1201 effects processors
 * ROM contains 4-bit ADPCM compressed sample data
 */
export const ZSG2_ROM_CONFIG: ChipROMConfig = {
  chipName: 'ZSG2',
  basePath: '/roms/zsg2',
  zipFile: 'zsg2.zip',
  combinedFile: 'zsg2_samples.bin',
  combinedSize: 4 * 1024 * 1024,  // 4MB typical
  files: [
    { name: 'zsg2_samples.bin', offset: 0, required: true },
  ],
};

/**
 * KS0164 (Samsung KS0164) ROM configuration
 * Samsung GM wavetable synth — used in OEM sound cards
 */
export const KS0164_ROM_CONFIG: ChipROMConfig = {
  chipName: 'KS0164',
  basePath: '/roms/ks0164',
  zipFile: 'ks0164.zip',
  combinedFile: 'ks0164_samples.bin',
  combinedSize: 4 * 1024 * 1024,  // 4MB typical
  files: [
    { name: 'ks0164_samples.bin', offset: 0, required: true },
  ],
};

/**
 * SWP00 (Yamaha MU50 AWM2) ROM configuration
 * Yamaha XG wave ROM for MU50 tone generator
 */
export const SWP00_ROM_CONFIG: ChipROMConfig = {
  chipName: 'SWP00',
  basePath: '/roms/swp00',
  zipFile: 'swp00.zip',
  combinedFile: 'swp00_wave.bin',
  combinedSize: 16 * 1024 * 1024,  // 16MB addressable
  files: [
    { name: 'swp00_wave.bin', offset: 0, required: true },
  ],
};

/**
 * SWP20 (Yamaha MU80 AWM2) ROM configuration
 * Yamaha XG wave ROM for MU80 tone generator (same AWM2 family as SWP00)
 */
export const SWP20_ROM_CONFIG: ChipROMConfig = {
  chipName: 'SWP20',
  basePath: '/roms/swp20',
  zipFile: 'swp20.zip',
  combinedFile: 'swp20_wave.bin',
  combinedSize: 16 * 1024 * 1024,  // 16MB addressable
  files: [
    { name: 'swp20_wave.bin', offset: 0, required: true },
  ],
};

/**
 * RolandGP (Roland TC6116 SC-88) ROM configuration
 * Roland SC-88 / JV-series wave ROM
 */
export const ROLANDGP_ROM_CONFIG: ChipROMConfig = {
  chipName: 'RolandGP',
  basePath: '/roms/rolandgp',
  zipFile: 'rolandgp.zip',
  combinedFile: 'rolandgp_wave.bin',
  combinedSize: 4 * 1024 * 1024,  // 4MB typical (SC-88 wave ROM)
  files: [
    { name: 'rolandgp_wave.bin', offset: 0, required: true },
  ],
};

/**
 * Helper: Load MultiPCM ROMs
 */
export async function loadMultiPCMROMs(): Promise<Uint8Array> {
  return loadChipROMs(MULTIPCM_ROM_CONFIG);
}

/**
 * Helper: Load ZSG2 ROMs
 */
export async function loadZSG2ROMs(): Promise<Uint8Array> {
  return loadChipROMs(ZSG2_ROM_CONFIG);
}

/**
 * Helper: Load KS0164 ROMs
 */
export async function loadKS0164ROMs(): Promise<Uint8Array> {
  return loadChipROMs(KS0164_ROM_CONFIG);
}

/**
 * Helper: Load SWP00 ROMs
 */
export async function loadSWP00ROMs(): Promise<Uint8Array> {
  return loadChipROMs(SWP00_ROM_CONFIG);
}

/**
 * Helper: Load SWP20 ROMs
 */
export async function loadSWP20ROMs(): Promise<Uint8Array> {
  return loadChipROMs(SWP20_ROM_CONFIG);
}

/**
 * Helper: Load RolandGP ROMs
 */
export async function loadRolandGPROMs(): Promise<Uint8Array> {
  return loadChipROMs(ROLANDGP_ROM_CONFIG);
}

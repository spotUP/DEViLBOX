/**
 * Load default DB303 preset from bundled XML file
 * Used to provide good default parameters when creating new JC303/DB303 instruments
 */

import { parseDb303Preset } from './Db303PresetConverter';
import type { TB303Config } from '@typedefs/instrument';
import { normalizeUrl } from '@/utils/urlUtils';

let cachedDefaultPreset: Partial<TB303Config> | null = null;

/**
 * Load and parse the default DB303 preset XML
 * Results are cached after first load
 */
export async function loadDefaultDb303Preset(): Promise<Partial<TB303Config>> {
  // Return cached version if already loaded
  if (cachedDefaultPreset) {
    return cachedDefaultPreset;
  }

  try {
    // Fetch the default preset XML from public folder
    const path = normalizeUrl('/data/songs/db303-default-preset.xml');
    const response = await fetch(path);

    if (!response.ok) {
      console.warn('Failed to load default DB303 preset, using fallback defaults');
      return getFallbackDefaults();
    }

    const xmlString = await response.text();

    // Parse the XML into TB303Config
    const preset = parseDb303Preset(xmlString);

    // Cache the result
    cachedDefaultPreset = preset;

    return preset;
  } catch (error) {
    console.warn('Error loading default DB303 preset:', error);
    return getFallbackDefaults();
  }
}

/**
 * Synchronous version that returns cached preset or fallback
 * Use this if preset has already been loaded
 */
export function getDefaultDb303PresetSync(): Partial<TB303Config> {
  if (cachedDefaultPreset) {
    return cachedDefaultPreset;
  }
  return getFallbackDefaults();
}

/**
 * Fallback defaults if XML file can't be loaded
 * These match the basic TB-303 sound
 */
function getFallbackDefaults(): Partial<TB303Config> {
  return {
    oscillator: {
      type: 'sawtooth',
      pulseWidth: 0,
      subOscGain: 0,
      subOscBlend: 100,
    },
    filter: {
      cutoff: 800,
      resonance: 50,
    },
    filterEnvelope: {
      envMod: 50,
      decay: 500,
    },
    accent: {
      amount: 50,
    },
    slide: {
      time: 170,
      mode: 'exponential',
    },
  };
}

/**
 * Preload the default preset (call on app init)
 * This ensures the preset is ready when needed
 */
export function preloadDefaultDb303Preset(): void {
  loadDefaultDb303Preset().catch((error) => {
    console.warn('Failed to preload DB303 default preset:', error);
  });
}

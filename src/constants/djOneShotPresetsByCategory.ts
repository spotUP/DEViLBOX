/**
 * DJ One-Shot Presets organized by category for preset browser.
 * Maps to indices in DJ_ONE_SHOT_PRESETS array.
 */

export interface OneShotPresetInfo {
  index: number;
  name: string;
  category: string;
  color: string;
}

const HORN_COLOR = '#ff6b35';
const RISER_COLOR = '#4ecdc4';
const IMPACT_COLOR = '#ff006e';
const LASER_COLOR = '#7209b7';
const SIREN_COLOR = '#f72585';
const NOISE_COLOR = '#9d4edd';
const TRANSITION_COLOR = '#3a86ff';

export const ONE_SHOT_PRESETS_BY_CATEGORY: Record<string, OneShotPresetInfo[]> = {
  'Horns & Stabs': [
    { index: 0, name: 'Air Horn', category: 'Horns', color: HORN_COLOR },
    { index: 1, name: 'Reggaeton Horn', category: 'Horns', color: HORN_COLOR },
    { index: 2, name: 'Foghorn', category: 'Horns', color: HORN_COLOR },
    { index: 3, name: 'Chord Stab', category: 'Horns', color: HORN_COLOR },
    { index: 4, name: 'Brass Stab', category: 'Horns', color: HORN_COLOR },
    { index: 5, name: 'Dub Horn', category: 'Horns', color: HORN_COLOR },
  ],
  'Risers & Buildups': [
    { index: 6, name: 'White Noise Riser', category: 'Risers', color: RISER_COLOR },
    { index: 7, name: 'Tension Builder', category: 'Risers', color: RISER_COLOR },
    { index: 8, name: 'Frequency Sweep', category: 'Risers', color: RISER_COLOR },
    { index: 9, name: 'Dark Riser', category: 'Risers', color: RISER_COLOR },
    { index: 10, name: 'Euphoria Riser', category: 'Risers', color: RISER_COLOR },
  ],
  'Impacts & Drops': [
    { index: 11, name: 'Sub Drop', category: 'Impacts', color: IMPACT_COLOR },
    { index: 12, name: 'Boom', category: 'Impacts', color: IMPACT_COLOR },
    { index: 13, name: 'Cinematic Hit', category: 'Impacts', color: IMPACT_COLOR },
    { index: 14, name: 'Earthquake', category: 'Impacts', color: IMPACT_COLOR },
    { index: 15, name: 'Crash Impact', category: 'Impacts', color: IMPACT_COLOR },
    { index: 16, name: 'Reverse Hit', category: 'Impacts', color: IMPACT_COLOR },
  ],
  'Lasers & Zaps': [
    { index: 17, name: 'DJ Laser', category: 'Lasers', color: LASER_COLOR },
    { index: 18, name: 'Glitch Zap', category: 'Lasers', color: LASER_COLOR },
    { index: 19, name: 'Pew Pew', category: 'Lasers', color: LASER_COLOR },
    { index: 20, name: 'Cosmic Ray', category: 'Lasers', color: LASER_COLOR },
  ],
  'Sirens & Alarms': [
    { index: 21, name: 'Dub Siren', category: 'Sirens', color: SIREN_COLOR },
    { index: 22, name: 'Rave Siren', category: 'Sirens', color: SIREN_COLOR },
    { index: 23, name: 'Ambulance', category: 'Sirens', color: SIREN_COLOR },
    { index: 24, name: 'Nuclear Alarm', category: 'Sirens', color: SIREN_COLOR },
    { index: 25, name: 'Wobble Siren', category: 'Sirens', color: SIREN_COLOR },
  ],
  'Noise & Texture': [
    { index: 26, name: 'Vinyl Scratch', category: 'Noise', color: NOISE_COLOR },
    { index: 27, name: 'Static Burst', category: 'Noise', color: NOISE_COLOR },
    { index: 28, name: 'Wind Gust', category: 'Noise', color: NOISE_COLOR },
    { index: 29, name: 'Radio Tune', category: 'Noise', color: NOISE_COLOR },
  ],
  'Transitions': [
    { index: 30, name: 'Echo Washout', category: 'Transitions', color: TRANSITION_COLOR },
    { index: 31, name: 'Rewind', category: 'Transitions', color: TRANSITION_COLOR },
    { index: 32, name: 'Tape Stop', category: 'Transitions', color: TRANSITION_COLOR },
    { index: 33, name: 'Splash', category: 'Transitions', color: TRANSITION_COLOR },
  ],
};

export const ALL_ONE_SHOT_PRESETS: OneShotPresetInfo[] = Object.values(ONE_SHOT_PRESETS_BY_CATEGORY).flat();

#!/usr/bin/env node
/**
 * Convert TB-303 parameters from normalized (0-1) to Hz/ms/% in all .dbx files
 * This reverses the previous normalization to match our new Hz/ms/% everywhere approach
 */

const fs = require('fs');
const path = require('path');

const SONGS_DIR = path.join(__dirname, '../public/data/songs');

// Denormalization helpers
const denormLog = (v, min, max) => {
  if (v > 1) return v; // Already in Hz/ms
  return min * Math.pow(max / min, v);
};

const denormPercent = (v) => {
  if (v > 1) return v; // Already in %
  return v * 100;
};

// TB-303 parameter ranges
const CUTOFF_MIN = 314;
const CUTOFF_MAX = 2394;
const DECAY_MIN = 200;
const DECAY_MAX = 2000;
const SLIDE_MIN = 2;
const SLIDE_MAX = 360;

function denormalizeTB303Config(tb303) {
  if (!tb303) return tb303;

  return {
    ...tb303,
    oscillator: {
      ...tb303.oscillator,
      subOscBlend: tb303.oscillator?.subOscBlend !== undefined 
        ? denormPercent(tb303.oscillator.subOscBlend) 
        : tb303.oscillator?.subOscBlend,
    },
    filter: {
      ...tb303.filter,
      cutoff: denormLog(tb303.filter?.cutoff ?? 0.5, CUTOFF_MIN, CUTOFF_MAX),
      resonance: denormPercent(tb303.filter?.resonance ?? 0.5),
    },
    filterEnvelope: {
      ...tb303.filterEnvelope,
      envMod: denormPercent(tb303.filterEnvelope?.envMod ?? 0.5),
      decay: denormLog(tb303.filterEnvelope?.decay ?? 0.5, DECAY_MIN, DECAY_MAX),
    },
    accent: {
      ...tb303.accent,
      amount: denormPercent(tb303.accent?.amount ?? 0.5),
    },
    slide: {
      ...tb303.slide,
      time: denormLog(tb303.slide?.time ?? 0.17, SLIDE_MIN, SLIDE_MAX),
    },
    overdrive: tb303.overdrive,
    devilFish: tb303.devilFish ? {
      ...tb303.devilFish,
      normalDecay: denormPercent(tb303.devilFish.normalDecay ?? 0.164),
      accentDecay: denormPercent(tb303.devilFish.accentDecay ?? 0.006),
      softAttack: denormPercent(tb303.devilFish.softAttack ?? 0),
      accentSoftAttack: denormPercent(tb303.devilFish.accentSoftAttack ?? 0.1),
      passbandCompensation: denormPercent(tb303.devilFish.passbandCompensation ?? 0.09),
      resTracking: denormPercent(tb303.devilFish.resTracking ?? 0.743),
      diodeCharacter: denormPercent(tb303.devilFish.diodeCharacter ?? 0.01),
      duffingAmount: denormPercent(tb303.devilFish.duffingAmount ?? 0.03),
      lpBpMix: denormPercent(tb303.devilFish.lpBpMix ?? 0),
      stageNLAmount: denormPercent(tb303.devilFish.stageNLAmount ?? 0),
      ensembleAmount: denormPercent(tb303.devilFish.ensembleAmount ?? 0),
      filterTracking: denormPercent(tb303.devilFish.filterTracking ?? 0),
      filterFmDepth: denormPercent(tb303.devilFish.filterFmDepth ?? 0),
    } : tb303.devilFish,
    lfo: tb303.lfo,
    effects: tb303.effects,
  };
}

function processSongFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const song = JSON.parse(content);
    
    let modified = false;

    // Process instruments
    if (song.instruments && Array.isArray(song.instruments)) {
      song.instruments.forEach((instrument) => {
        if (instrument.tb303) {
          const oldCutoff = instrument.tb303.filter?.cutoff;
          instrument.tb303 = denormalizeTB303Config(instrument.tb303);
          if (oldCutoff !== instrument.tb303.filter.cutoff) {
            modified = true;
          }
        }
      });
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(song, null, 2), 'utf-8');
      return true;
    }
    return false;
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
    return false;
  }
}

// Find all .dbx files
const files = fs.readdirSync(SONGS_DIR).filter(f => f.endsWith('.dbx'));

console.log(`Found ${files.length} .dbx files`);

let processed = 0;
files.forEach(file => {
  const filePath = path.join(SONGS_DIR, file);
  if (processSongFile(filePath)) {
    console.log(`✓ Denormalized: ${file}`);
    processed++;
  }
});

console.log(`\n✓ Denormalized ${processed} song files to Hz/ms/%`);

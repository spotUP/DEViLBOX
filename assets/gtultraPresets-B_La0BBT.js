const SID_PRESETS = [
  // ── Bass ──
  {
    name: "Classic Bass",
    category: "bass",
    description: "Punchy sawtooth bass, staple of C64 game music",
    ad: 9,
    sr: 0,
    waveform: 33
    // saw + gate
  },
  {
    name: "Sub Bass",
    category: "bass",
    description: "Deep triangle bass for low-end rumble",
    ad: 10,
    sr: 0,
    waveform: 17
    // tri + gate
  },
  {
    name: "Acid Bass",
    category: "bass",
    description: "Pulse wave with filter sweep — acid house feel",
    ad: 8,
    sr: 0,
    waveform: 65,
    // pulse + gate
    pulseWidth: 2048
  },
  {
    name: "Hubbard Bass",
    category: "bass",
    description: "Rob Hubbard style — saw attack into pulse sustain",
    ad: 9,
    sr: 160,
    waveform: 33
    // saw → pulse (via wavetable)
  },
  {
    name: "Galway Bass",
    category: "bass",
    description: "Martin Galway style — short punchy bass",
    ad: 7,
    sr: 0,
    waveform: 33
  },
  // ── Lead ──
  {
    name: "Classic Lead",
    category: "lead",
    description: "Bright sawtooth lead for melodies",
    ad: 10,
    sr: 154,
    waveform: 33
  },
  {
    name: "Pulse Lead",
    category: "lead",
    description: "Warm pulse wave lead with medium sustain",
    ad: 9,
    sr: 169,
    waveform: 65,
    pulseWidth: 1024
  },
  {
    name: "PWM Lead",
    category: "lead",
    description: "Pulse width modulation lead — rich and animated",
    ad: 9,
    sr: 169,
    waveform: 65,
    pulseWidth: 2048
  },
  {
    name: "Triangle Lead",
    category: "lead",
    description: "Pure triangle wave — flute-like tone",
    ad: 42,
    sr: 170,
    waveform: 17
  },
  {
    name: "Sync Lead",
    category: "lead",
    description: "Hard sync sawtooth — metallic bite",
    ad: 9,
    sr: 169,
    waveform: 35
    // saw + sync + gate
  },
  {
    name: "Ring Mod Lead",
    category: "lead",
    description: "Ring modulated triangle — bell-like overtones",
    ad: 42,
    sr: 138,
    waveform: 21
    // tri + ring + gate
  },
  // ── Pad / Atmosphere ──
  {
    name: "Soft Pad",
    category: "pad",
    description: "Slow attack triangle pad for ambience",
    ad: 140,
    sr: 140,
    waveform: 17
  },
  {
    name: "Pulse Pad",
    category: "pad",
    description: "Wide pulse pad with slow release",
    ad: 107,
    sr: 155,
    waveform: 65,
    pulseWidth: 3072
  },
  {
    name: "Saw Pad",
    category: "pad",
    description: "Sawtooth pad — full and bright",
    ad: 107,
    sr: 139,
    waveform: 33
  },
  // ── Arpeggio ──
  {
    name: "Fast Arp",
    category: "arp",
    description: "Quick arpeggio pulse for chip-tune feel",
    ad: 8,
    sr: 128,
    waveform: 65,
    pulseWidth: 2048,
    gatetimer: 2
  },
  {
    name: "Saw Arp",
    category: "arp",
    description: "Sawtooth arpeggio — classic chiptune chord",
    ad: 9,
    sr: 0,
    waveform: 33,
    gatetimer: 2
  },
  // ── Drums / Percussion ──
  {
    name: "Snare",
    category: "drum",
    description: "Noise-based snare drum",
    ad: 0,
    sr: 0,
    waveform: 129
    // noise + gate
  },
  {
    name: "Kick",
    category: "drum",
    description: "Triangle kick with pitch sweep (via wavetable)",
    ad: 9,
    sr: 0,
    waveform: 17
  },
  {
    name: "Hi-Hat",
    category: "drum",
    description: "Short noise burst for hi-hat",
    ad: 0,
    sr: 0,
    waveform: 129,
    gatetimer: 1
  },
  {
    name: "Tom",
    category: "drum",
    description: "Triangle tom with medium decay",
    ad: 7,
    sr: 0,
    waveform: 17
  },
  // ── FX ──
  {
    name: "Laser",
    category: "fx",
    description: "Descending pitch sweep — pew pew!",
    ad: 0,
    sr: 0,
    waveform: 65,
    pulseWidth: 2048
  },
  {
    name: "Explosion",
    category: "fx",
    description: "Long noise decay for explosions",
    ad: 13,
    sr: 0,
    waveform: 129
  },
  {
    name: "Alarm",
    category: "fx",
    description: "Alternating frequency alarm tone",
    ad: 9,
    sr: 240,
    waveform: 65,
    pulseWidth: 1024
  },
  // ── Classic C64 Sounds ──
  {
    name: "Commando",
    category: "classic",
    description: "Rob Hubbard Commando-style lead",
    ad: 9,
    sr: 0,
    waveform: 65,
    pulseWidth: 1536
  },
  {
    name: "Monty Bass",
    category: "classic",
    description: "Monty on the Run bass line style",
    ad: 9,
    sr: 0,
    waveform: 33
  },
  {
    name: "Last Ninja",
    category: "classic",
    description: "Ben Daglish Last Ninja style melody",
    ad: 10,
    sr: 154,
    waveform: 65,
    pulseWidth: 2048
  },
  {
    name: "Forbidden Forest",
    category: "classic",
    description: "Paul Norman atmospheric pad",
    ad: 107,
    sr: 139,
    waveform: 17
  },
  {
    name: "Ocean Loader",
    category: "classic",
    description: "Martin Galway Ocean loader style",
    ad: 9,
    sr: 160,
    waveform: 65,
    pulseWidth: 2560
  },
  // ── Template (with table programs) ──
  {
    name: "PWM Bass",
    category: "template",
    description: "Pulse width modulation bass with smooth PWM sweep",
    ad: 9,
    sr: 160,
    waveform: 65,
    pulseWidth: 2048,
    suggestedPulseTable: [8, 64, 8, 192]
  },
  {
    name: "Filter Sweep Lead",
    category: "template",
    description: "Sawtooth lead with automated filter sweep",
    ad: 10,
    sr: 154,
    waveform: 33,
    suggestedFilterTable: [1, 255, 1, 224, 1, 192, 1, 160, 1, 128]
  },
  {
    name: "Arpeggio Pad",
    category: "template",
    description: "Triangle pad with 3-note arpeggio via wavetable",
    ad: 42,
    sr: 138,
    waveform: 17,
    gatetimer: 2,
    suggestedWaveTable: [17, 17, 17]
  },
  {
    name: "Drum Kit Kick",
    category: "template",
    description: "Pitch-sweep kick drum with noise transient",
    ad: 0,
    sr: 0,
    waveform: 129,
    suggestedWaveTable: [129, 17, 17]
  },
  {
    name: "Wobble Bass",
    category: "template",
    description: "Sawtooth bass with rhythmic filter wobble",
    ad: 9,
    sr: 0,
    waveform: 33,
    suggestedFilterTable: [1, 255, 1, 64, 1, 255, 1, 64]
  },
  {
    name: "Chip Chord",
    category: "template",
    description: "Fast arp pulse chord with PWM animation",
    ad: 8,
    sr: 128,
    waveform: 65,
    pulseWidth: 2048,
    gatetimer: 2,
    suggestedWaveTable: [65, 65, 65],
    suggestedPulseTable: [8, 96, 8, 160, 8, 96]
  }
];
function getPresetsByCategory(category) {
  return SID_PRESETS.filter((p) => p.category === category);
}
function getPresetCategories() {
  return [...new Set(SID_PRESETS.map((p) => p.category))];
}
function findFreeTableSlot(tableLeft, length) {
  for (let start = 1; start <= tableLeft.length - length; start++) {
    let free = true;
    for (let j = 0; j < length; j++) {
      if (tableLeft[start + j] !== 0) {
        free = false;
        break;
      }
    }
    if (free) return start;
  }
  return -1;
}
function applyPresetToInstrument(preset, instrumentIndex, engine, tableData) {
  var _a, _b, _c;
  if (engine && tableData) {
    if (preset.suggestedWaveTable && preset.suggestedWaveTable.length > 0) {
      const slot = findFreeTableSlot(((_a = tableData["wave"]) == null ? void 0 : _a.left) ?? new Uint8Array(255), preset.suggestedWaveTable.length);
      if (slot >= 0) {
        for (let i = 0; i < preset.suggestedWaveTable.length; i++) {
          engine.setTableEntry(0, 0, slot + i, preset.suggestedWaveTable[i]);
        }
        engine.setInstrumentTablePtr(instrumentIndex, 0, slot);
      }
    }
    if (preset.suggestedPulseTable && preset.suggestedPulseTable.length > 0) {
      const pairCount = Math.ceil(preset.suggestedPulseTable.length / 2);
      const slot = findFreeTableSlot(((_b = tableData["pulse"]) == null ? void 0 : _b.left) ?? new Uint8Array(255), pairCount);
      if (slot >= 0) {
        for (let i = 0; i < preset.suggestedPulseTable.length; i++) {
          const side = i % 2 === 0 ? 0 : 1;
          const entryIdx = slot + Math.floor(i / 2);
          engine.setTableEntry(1, side, entryIdx, preset.suggestedPulseTable[i]);
        }
        engine.setInstrumentTablePtr(instrumentIndex, 1, slot);
      }
    }
    if (preset.suggestedFilterTable && preset.suggestedFilterTable.length > 0) {
      const pairCount = Math.ceil(preset.suggestedFilterTable.length / 2);
      const slot = findFreeTableSlot(((_c = tableData["filter"]) == null ? void 0 : _c.left) ?? new Uint8Array(255), pairCount);
      if (slot >= 0) {
        for (let i = 0; i < preset.suggestedFilterTable.length; i++) {
          const side = i % 2 === 0 ? 0 : 1;
          const entryIdx = slot + Math.floor(i / 2);
          engine.setTableEntry(2, side, entryIdx, preset.suggestedFilterTable[i]);
        }
        engine.setInstrumentTablePtr(instrumentIndex, 2, slot);
      }
    }
  }
  return {
    ad: preset.ad,
    sr: preset.sr,
    firstwave: preset.waveform,
    name: preset.name
  };
}
export {
  SID_PRESETS as S,
  getPresetsByCategory as a,
  applyPresetToInstrument as b,
  getPresetCategories as g
};

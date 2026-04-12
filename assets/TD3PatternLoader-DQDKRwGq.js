const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function isTD3File(filename) {
  const lower = filename.toLowerCase();
  return lower.endsWith(".sqs") || lower.endsWith(".seq");
}
function decodeNibbledBits(bytes, offset) {
  const bits = [];
  const byte0 = bytes[offset];
  const byte1 = bytes[offset + 1];
  const word0 = byte0 << 4 | byte1 & 15;
  const byte2 = bytes[offset + 2];
  const byte3 = bytes[offset + 3];
  const word1 = byte2 << 4 | byte3 & 15;
  const fullWord = word1 << 8 | word0;
  for (let i = 0; i < 16; i++) {
    bits.push((fullWord >> i & 1) !== 0);
  }
  return bits;
}
async function parseTD3File(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const magic = view.getUint32(0, false);
  const isSEQ = magic === 597185654;
  const isSQS = magic === 2269352194;
  if (!isSEQ && !isSQS) {
    throw new Error(`Invalid TD-3 file: bad magic bytes (0x${magic.toString(16).toUpperCase()})`);
  }
  let deviceName = "";
  for (let i = 8; i < 20; i += 2) {
    const char = view.getUint16(i, false);
    if (char === 0) break;
    deviceName += String.fromCharCode(char);
  }
  let version = "";
  for (let i = 20; i < 32; i += 2) {
    const char = view.getUint16(i, false);
    if (char === 0) break;
    version += String.fromCharCode(char);
  }
  console.log(`[TD3Loader] Parsing ${deviceName} file, version ${version}`);
  const patterns = [];
  if (isSEQ) {
    let offset = 32;
    while (offset <= buffer.byteLength - 114) {
      const dataOffset = offset + 4;
      const steps = [];
      const notesBase = dataOffset;
      const accentsBase = dataOffset + 32;
      const slidesBase = dataOffset + 64;
      const triplet = (bytes[dataOffset + 96] << 4 | bytes[dataOffset + 97] & 15) !== 0;
      const length = bytes[dataOffset + 98] << 4 | bytes[dataOffset + 99] & 15;
      const tieBits = decodeNibbledBits(bytes, dataOffset + 102);
      const restBits = decodeNibbledBits(bytes, dataOffset + 106);
      let triggerIdx = 0;
      let lastStep = null;
      for (let i = 0; i < 16; i++) {
        const isTrigger = tieBits[i];
        if (isTrigger) {
          const nOffset = notesBase + triggerIdx * 2;
          const noteVal = bytes[nOffset] << 4 | bytes[nOffset + 1] & 15;
          const octave = Math.floor(noteVal / 12);
          const note = noteVal % 12;
          const upperC = noteVal === 60;
          const isRest = restBits[i];
          const step = {
            note: isRest ? null : {
              value: note,
              octave: Math.max(0, Math.min(2, octave - 2)),
              upperC
            },
            accent: bytes[accentsBase + triggerIdx * 2 + 1] !== 0,
            slide: bytes[slidesBase + triggerIdx * 2 + 1] !== 0,
            tie: false
          };
          steps.push(step);
          lastStep = step;
          triggerIdx++;
        } else {
          if (lastStep && lastStep.note) {
            steps.push({
              ...lastStep,
              tie: true
              // Sustain flag
            });
          } else {
            steps.push({
              note: null,
              accent: false,
              slide: false,
              tie: false
            });
          }
        }
      }
      patterns.push({
        index: patterns.length,
        name: `Pattern ${patterns.length + 1}`,
        steps,
        length: length || 16,
        tempo: 120,
        triplet
      });
      offset += 114;
    }
  } else {
    let offset = 32;
    while (offset < buffer.byteLength - 100) {
      if (bytes[offset + 2] === 0 && bytes[offset + 3] === 112) {
        offset += 126;
      } else {
        offset++;
      }
    }
  }
  console.log(`[TD3Loader] Found ${patterns.length} patterns`);
  return {
    name: deviceName,
    version,
    patterns
  };
}
function convertTD3PatternToDbox(td3Pattern, baseOctave = 2) {
  const rows = td3Pattern.steps.map((step) => {
    if (!step.note) {
      return {
        note: null,
        instrument: 1,
        volume: null,
        effect: null,
        accent: false,
        slide: false
      };
    }
    const noteName = NOTE_NAMES[step.note.value];
    const octave = baseOctave + step.note.octave + (step.note.upperC ? 1 : 0);
    const noteStr = `${noteName}${octave}`;
    return {
      note: noteStr,
      instrument: 1,
      // TB-303 instrument
      volume: null,
      effect: null,
      accent: step.accent,
      slide: step.slide
    };
  });
  return { rows };
}
function convertTD3FileToDbox(td3File, filename) {
  const patterns = td3File.patterns.map((td3Pattern, idx) => {
    const converted = convertTD3PatternToDbox(td3Pattern);
    return {
      id: `td3-pattern-${idx}`,
      name: td3Pattern.name,
      length: 16,
      channels: [
        {
          id: `ch-303-${idx}`,
          name: "TB-303",
          muted: false,
          solo: false,
          volume: 80,
          pan: 0,
          instrumentId: 1,
          color: "#ec4899",
          rows: converted.rows
        }
      ]
    };
  });
  const instruments = [
    {
      id: 1,
      name: "TB-303",
      synthType: "TB303",
      tb303: {
        oscillator: { type: "sawtooth" },
        filter: { cutoff: 800, resonance: 70 },
        filterEnvelope: { envMod: 80, decay: 200 },
        accent: { amount: 85 },
        slide: { time: 50, mode: "exponential" },
        overdrive: { amount: 25 }
      },
      effects: [],
      volume: -6,
      pan: 0
    }
  ];
  return {
    format: "devilbox-dbox",
    version: "1.0.0",
    metadata: {
      id: `td3-${Date.now()}`,
      name: filename.replace(".sqs", "").replace(".seq", "") || "TD-3 Patterns",
      author: "TD-3 Import",
      description: `Imported from ${td3File.name} v${td3File.version}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    bpm: 125,
    instruments,
    patterns,
    sequence: patterns.map((p) => p.id),
    masterVolume: 0,
    masterEffects: []
  };
}
export {
  convertTD3FileToDbox,
  convertTD3PatternToDbox,
  isTD3File,
  parseTD3File
};

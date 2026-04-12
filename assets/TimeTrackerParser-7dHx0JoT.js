const MIN_FILE_SIZE = 10;
const MAX_SAMPLES = 127;
function isTimeTrackerFormat(buffer) {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 4) return false;
  return buf[0] === 84 && buf[1] === 77 && buf[2] === 75 && buf[3] !== 0;
}
function parseTimeTrackerFile(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (!isTimeTrackerFormat(buf)) {
    throw new Error("Not a TimeTracker module");
  }
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/^tmk\./i, "").replace(/\.tmk$/i, "") || baseName;
  let subsongCount = 1;
  let sampleCount = 0;
  if (buf.length >= MIN_FILE_SIZE) {
    const rawSubsongs = buf[3];
    subsongCount = rawSubsongs;
    const rawSamples = buf[5] & 127;
    if (rawSamples > 0) sampleCount = Math.min(rawSamples, MAX_SAMPLES);
  }
  const instrumentCount = sampleCount || 1;
  const instruments = Array.from(
    { length: instrumentCount },
    (_, i) => ({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: "synth",
      synthType: "Synth",
      effects: [],
      volume: 0,
      pan: 0
    })
  );
  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  }));
  const pattern = {
    id: "pattern-0",
    name: "Pattern 0",
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      // Amiga hard-left/hard-right panning: ch 0 & 3 = -50, ch 1 & 2 = +50
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows
    })),
    importMetadata: {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: sampleCount
    }
  };
  const songName = subsongCount > 1 ? `${moduleName} [TimeTracker](${subsongCount} subsongs)` : `${moduleName} [TimeTracker]`;
  return {
    name: songName,
    format: "MOD",
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isTimeTrackerFormat,
  parseTimeTrackerFile
};

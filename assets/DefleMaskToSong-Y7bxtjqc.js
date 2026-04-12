import { d0 as DefleMaskParser } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function parseDefleMaskToTrackerSong(buffer, fileName) {
  const dmf = DefleMaskParser.parse(buffer, "dmf");
  const numChannels = dmf.channelCount;
  const numRows = dmf.patternRows;
  const patterns = [];
  const songPositions = [];
  for (let matrixPos = 0; matrixPos < dmf.matrixRows; matrixPos++) {
    const patIdx = patterns.length;
    songPositions.push(patIdx);
    const channels = Array.from({ length: numChannels }, (_, ch) => {
      var _a;
      const patNum = ((_a = dmf.patternMatrix[ch]) == null ? void 0 : _a[matrixPos]) ?? 0;
      const patternOffset = ch * dmf.matrixRows + patNum;
      const dmfPat = dmf.patterns[patternOffset];
      const rows = Array.from({ length: numRows }, (__, row) => {
        var _a2, _b;
        const dmfNote = (_b = (_a2 = dmfPat == null ? void 0 : dmfPat.rows) == null ? void 0 : _a2[row]) == null ? void 0 : _b[ch];
        return convertDMFNote(dmfNote);
      });
      return {
        id: `channel-${ch}`,
        name: `Ch ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
        rows
      };
    });
    patterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      channels,
      length: numRows
    });
  }
  const instruments = dmf.instruments.map((inst, idx) => ({
    id: idx + 1,
    name: inst.name || `Instrument ${idx + 1}`,
    type: "synth",
    synthType: "ChipSynth",
    chipType: dmf.system.chipType,
    furnace: inst.config,
    effects: [],
    volume: -6,
    pan: 0
  }));
  const hz = 60;
  const speed = dmf.ticksPerRow[0] || 6;
  const bpm = Math.round(hz * 2.5 / speed);
  const song = {
    name: dmf.name || fileName.replace(/\.[^.]+$/, ""),
    format: "DMF",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: speed,
    initialBPM: bpm > 0 ? bpm : 125,
    linearPeriods: true
  };
  return song;
}
function convertDMFNote(dmfNote) {
  const cell = {
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  };
  if (!dmfNote) return cell;
  if (dmfNote.note === 100) {
    cell.note = 97;
  } else if (dmfNote.note >= 0 && dmfNote.note <= 11) {
    const octave = Math.max(0, Math.min(7, dmfNote.octave));
    cell.note = octave * 12 + dmfNote.note + 1;
    if (cell.note > 96) cell.note = 96;
    if (cell.note < 1) cell.note = 0;
  }
  if (dmfNote.instrument >= 0) {
    cell.instrument = dmfNote.instrument + 1;
  }
  if (dmfNote.volume >= 0) {
    cell.volume = 16 + Math.floor(dmfNote.volume * 4);
  }
  if (dmfNote.effects.length > 0) {
    const fx = dmfNote.effects[0];
    cell.effTyp = mapDMFEffect(fx.code);
    cell.eff = fx.value & 255;
  }
  return cell;
}
function mapDMFEffect(code) {
  switch (code) {
    case 0:
      return 0;
    // Arpeggio
    case 1:
      return 1;
    // Porta up
    case 2:
      return 2;
    // Porta down
    case 3:
      return 3;
    // Tone porta
    case 4:
      return 4;
    // Vibrato
    case 7:
      return 7;
    // Tremolo
    case 8:
      return 8;
    // Panning
    case 9:
      return 9;
    // Sample offset
    case 10:
      return 10;
    // Volume slide
    case 11:
      return 11;
    // Position jump
    case 12:
      return 12;
    // Set volume
    case 13:
      return 13;
    // Pattern break
    case 15:
      return 15;
    // Set speed
    default:
      return 0;
  }
}
export {
  parseDefleMaskToTrackerSong
};

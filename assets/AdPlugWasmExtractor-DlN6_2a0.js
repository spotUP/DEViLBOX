import { bY as DEFAULT_OPL3 } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function emptyPattern(id, name, numCh, rows) {
  return {
    id,
    name,
    length: rows,
    channels: Array.from({ length: numCh }, (_, i) => ({
      id: `ch${i}`,
      name: `CH ${i + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: rows }, emptyCell)
    }))
  };
}
function makeOPLInstrument(id, name) {
  return {
    id,
    name,
    type: "synth",
    synthType: "OPL3",
    opl3: { ...DEFAULT_OPL3 },
    effects: [],
    volume: 64,
    pan: 0
  };
}
function applyOPLRegisters(inst, regs) {
  const o = inst.opl3;
  if (!o) return;
  o.op1Tremolo = regs[0] >> 7 & 1;
  o.op1Vibrato = regs[0] >> 6 & 1;
  o.op1SustainHold = regs[0] >> 5 & 1;
  o.op1KSR = regs[0] >> 4 & 1;
  o.op1Multi = regs[0] & 15;
  o.op2Tremolo = regs[1] >> 7 & 1;
  o.op2Vibrato = regs[1] >> 6 & 1;
  o.op2SustainHold = regs[1] >> 5 & 1;
  o.op2KSR = regs[1] >> 4 & 1;
  o.op2Multi = regs[1] & 15;
  o.op1KSL = regs[2] >> 6 & 3;
  o.op1Level = 63 - (regs[2] & 63);
  o.op2KSL = regs[3] >> 6 & 3;
  o.op2Level = 63 - (regs[3] & 63);
  o.op1Attack = regs[4] >> 4 & 15;
  o.op1Decay = regs[4] & 15;
  o.op2Attack = regs[5] >> 4 & 15;
  o.op2Decay = regs[5] & 15;
  o.op1Sustain = regs[6] >> 4 & 15;
  o.op1Release = regs[6] & 15;
  o.op2Sustain = regs[7] >> 4 & 15;
  o.op2Release = regs[7] & 15;
  o.op1Waveform = regs[8] & 7;
  o.op2Waveform = regs[9] & 7;
  o.feedback = regs[10] >> 1 & 7;
  o.connection = regs[10] & 1;
}
function cmodNoteToXM(cmodNote) {
  if (cmodNote === 0) return 0;
  if (cmodNote >= 127) return 97;
  return Math.max(1, Math.min(96, cmodNote));
}
function cmodCmdToXM(cmd, param) {
  switch (cmd) {
    case 0:
      return [0, 0];
    // none
    case 1:
      return [1, param];
    // portamento up
    case 2:
      return [2, param];
    // portamento down
    case 3:
      return [3, param];
    // tone portamento
    case 4:
      return [4, param];
    // vibrato
    case 5:
      return [5, param];
    // vol slide + tone porta
    case 6:
      return [6, param];
    // vol slide + vibrato
    case 7:
      return [0, param];
    // arpeggio → XM effect 0
    case 8:
      return [14, param];
    // special → E-command
    case 9:
      return [10, param << 4];
    // vol slide up → Ax0
    case 10:
      return [10, param & 15];
    // vol slide down → A0x
    case 11:
      return [13, param];
    // pattern break → Dxx
    case 12:
      return [11, param];
    // order jump → Bxx
    case 13:
      return [15, param];
    // set speed → Fxx
    case 14:
      return [15, param];
    // tempo → Fxx (speed + tempo share effect F in XM)
    case 15:
      return [12, param];
    // set volume → Cxx
    default:
      return [0, 0];
  }
}
let wasmModule = null;
let wasmLoading = null;
function invalidateAdPlugModule() {
  if (wasmModule) {
    try {
      wasmModule._adplug_shutdown();
    } catch {
    }
  }
  wasmModule = null;
  wasmLoading = null;
}
async function getModule() {
  if (wasmModule) return wasmModule;
  if (wasmLoading) return wasmLoading;
  wasmLoading = (async () => {
    const cb = `?v=${Date.now()}`;
    const response = await fetch(`/adplug/AdPlugPlayer.js${cb}`);
    const jsText = await response.text();
    const factory = new Function(jsText + "; return createAdPlugPlayer;")();
    const m = await factory({
      locateFile: (f) => `/adplug/${f}${cb}`
    });
    m._adplug_init(48e3);
    wasmModule = m;
    return m;
  })();
  return wasmLoading;
}
async function extractAdPlugPatterns(buffer, filename, companions) {
  const M = await getModule();
  const data = new Uint8Array(buffer);
  if (companions) {
    for (const comp of companions) {
      const compData = new Uint8Array(comp.data);
      const compPtr = M._malloc(compData.length);
      M.HEAPU8.set(compData, compPtr);
      const compNameBytes = new TextEncoder().encode(comp.name);
      const compNamePtr = M._malloc(compNameBytes.length + 1);
      M.HEAPU8.set(compNameBytes, compNamePtr);
      M.HEAPU8[compNamePtr + compNameBytes.length] = 0;
      M._adplug_add_companion(compPtr, compData.length, compNamePtr);
      M._free(compPtr);
      M._free(compNamePtr);
    }
  }
  const dataPtr = M._malloc(data.length);
  M.HEAPU8.set(data, dataPtr);
  const fnameBytes = new TextEncoder().encode(filename);
  const fnamePtr = M._malloc(fnameBytes.length + 1);
  M.HEAPU8.set(fnameBytes, fnamePtr);
  M.HEAPU8[fnamePtr + fnameBytes.length] = 0;
  const loaded = M._adplug_load(dataPtr, data.length, fnamePtr);
  M._free(dataPtr);
  M._free(fnamePtr);
  if (loaded !== 0) return null;
  try {
    let numPatterns = M._adplug_get_patterns();
    let numOrders = M._adplug_get_orders();
    let numChannels = M._adplug_get_channels();
    const numRows = M._adplug_get_rows();
    let rawSpeed = M._adplug_get_speed();
    let rawBpm = M._adplug_get_bpm_value();
    const restartPos = M._adplug_get_restart_pos();
    const title = M.UTF8ToString(M._adplug_get_title());
    const type = M.UTF8ToString(M._adplug_get_type());
    const playerRefresh = M._adplug_get_refresh_rate();
    const isCmodFormat = M._adplug_is_cmod_player() !== 0;
    let usedCapture = false;
    console.log(`[AdPlug] WASM returned: type="${type}" pat=${numPatterns} ord=${numOrders} ch=${numChannels} rows=${numRows} speed=${rawSpeed} bpm=${rawBpm}`);
    if (numPatterns === 0 || numOrders === 0 || numChannels === 0) {
      console.log(`[AdPlug] No native patterns — running OPL capture scan...`);
      const capturedEvents = M._adplug_capture_song();
      console.log(`[AdPlug] OPL capture: ${capturedEvents} events`);
      if (!capturedEvents || capturedEvents === 0) return null;
      numPatterns = M._adplug_get_patterns();
      numOrders = M._adplug_get_orders();
      numChannels = M._adplug_get_channels();
      usedCapture = true;
      console.log(`[AdPlug] After capture: pat=${numPatterns} ord=${numOrders} ch=${numChannels}`);
      if (numPatterns === 0 || numOrders === 0 || numChannels === 0) return null;
    }
    if (!usedCapture && numPatterns > 0 && numChannels > 0) {
      let sampleNotes = 0;
      const checkPats = Math.min(numPatterns, 3);
      for (let p = 0; p < checkPats; p++)
        for (let r = 0; r < numRows; r++)
          for (let c = 0; c < numChannels; c++) {
            const pk = M._adplug_get_note(p, r, c);
            if (pk && (pk & 255) > 0 && (pk & 255) < 127) sampleNotes++;
          }
      const expectedMin = checkPats * numRows * 0.02;
      if (sampleNotes < expectedMin && sampleNotes < 5) {
        console.log(`[AdPlug] Native extraction nearly empty (${sampleNotes} notes in ${checkPats} patterns) — forcing OPL capture`);
        const capturedEvents = M._adplug_capture_song();
        if (capturedEvents > 0) {
          numPatterns = M._adplug_get_patterns();
          numOrders = M._adplug_get_orders();
          numChannels = M._adplug_get_channels();
          usedCapture = true;
          console.log(`[AdPlug] Capture fallback: ${capturedEvents} events → pat=${numPatterns} ord=${numOrders} ch=${numChannels}`);
        }
      }
    }
    if (numChannels > 24 || numRows > 256) return null;
    let finalSpeed;
    let finalBpm;
    const refresh = usedCapture ? M._adplug_capture_get_refresh_rate() : playerRefresh;
    if (usedCapture) {
      const ticksPerRow = Math.max(1, M._adplug_capture_get_ticks_per_row());
      finalSpeed = Math.min(31, ticksPerRow);
      finalBpm = Math.round(refresh * 5 / 2);
    } else {
      finalSpeed = rawSpeed > 0 && rawSpeed <= 31 ? rawSpeed : 6;
      if (rawBpm > 0 && rawBpm <= 300) {
        finalBpm = rawBpm;
      } else if (refresh > 0) {
        finalBpm = Math.round(refresh * 5 / 2);
      } else {
        finalBpm = 125;
      }
    }
    if (finalBpm > 300) {
      const factor = Math.ceil(finalBpm / 150);
      finalSpeed = Math.min(31, finalSpeed * factor);
      finalBpm = Math.round(finalBpm / factor);
    }
    if (finalBpm < 32) {
      finalBpm = 125;
      finalSpeed = 6;
    }
    finalBpm = Math.max(32, Math.min(300, finalBpm));
    finalSpeed = Math.max(1, Math.min(31, finalSpeed));
    const tprForLog = usedCapture ? M._adplug_capture_get_ticks_per_row() : "N/A";
    console.log(`[AdPlug] Timing: refresh=${refresh}Hz usedCapture=${usedCapture} ticksPerRow=${tprForLog} → BPM=${finalBpm} speed=${finalSpeed} rowRate=${(finalBpm * 2 / (5 * finalSpeed)).toFixed(1)}/sec`);
    const songPositions = [];
    for (let i = 0; i < numOrders; i++) {
      const entry = M._adplug_get_order_entry(i);
      if (entry === 65535 || entry >= numPatterns) break;
      songPositions.push(entry);
    }
    if (songPositions.length === 0) return null;
    const numInst = M._adplug_get_num_instruments();
    const instruments = [];
    const regsPtr = M._malloc(11);
    for (let i = 0; i < Math.max(numInst, 1); i++) {
      const instName = numInst > 0 ? M.UTF8ToString(M._adplug_get_instrument_name(i)) : "";
      const inst = makeOPLInstrument(i + 1, instName.trim() || `Inst ${i + 1}`);
      if (M._adplug_get_instrument_regs(i, regsPtr)) {
        const regs = new Uint8Array(11);
        let sum = 0;
        for (let j = 0; j < 11; j++) {
          regs[j] = M.HEAPU8[regsPtr + j];
          sum += regs[j];
        }
        if (sum > 0) applyOPLRegisters(inst, regs);
      }
      instruments.push(inst);
    }
    M._free(regsPtr);
    const patterns = [];
    let totalNotes = 0;
    const channelInst = new Uint8Array(numChannels);
    const isHSC = type.toLowerCase().includes("hsc");
    if (isHSC) {
      for (let c = 0; c < numChannels; c++) {
        channelInst[c] = Math.min(c + 1, instruments.length);
      }
    }
    const patternInstruments = /* @__PURE__ */ new Map();
    for (let sp = 0; sp < songPositions.length; sp++) {
      const p = songPositions[sp];
      if (p >= numPatterns) continue;
      if (!patternInstruments.has(p)) {
        patternInstruments.set(p, []);
      }
      const instRows = patternInstruments.get(p);
      for (let r = 0; r < numRows; r++) {
        if (!instRows[r]) instRows[r] = new Uint8Array(numChannels);
        for (let c = 0; c < numChannels; c++) {
          const packed = M._adplug_get_note(p, r, c);
          if (packed === 0) continue;
          const cmodInst = packed >> 8 & 255;
          if (cmodInst > 0) {
            channelInst[c] = cmodInst;
          }
          instRows[r][c] = channelInst[c];
        }
      }
    }
    for (let p = 0; p < numPatterns; p++) {
      const pat = emptyPattern(`p${p}`, `Pattern ${p}`, numChannels, numRows);
      const instRows = patternInstruments.get(p);
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numChannels; c++) {
          const packed = M._adplug_get_note(p, r, c);
          if (packed === 0) continue;
          const cmodNote = packed & 255;
          const cmodInst = packed >> 8 & 255;
          const cmodCmd = packed >> 16 & 255;
          const cmodParam = packed >> 24 & 255;
          const cell = pat.channels[c].rows[r];
          cell.note = cmodNoteToXM(cmodNote);
          if (cmodInst > 0) {
            cell.instrument = cmodInst;
          } else if (instRows && instRows[r]) {
            cell.instrument = instRows[r][c] || 0;
          }
          if (cmodCmd > 0) {
            if (isCmodFormat) {
              const [effTyp, eff] = cmodCmdToXM(cmodCmd, cmodParam);
              cell.effTyp = effTyp;
              cell.eff = eff;
            } else {
              cell.effTyp = cmodCmd;
              cell.eff = cmodParam;
            }
          }
          if (cell.note > 0 && cell.note < 97) totalNotes++;
        }
      }
      patterns.push(pat);
    }
    console.log(`[AdPlug] Extraction complete: ${totalNotes} notes in ${patterns.length} patterns, ${numChannels} channels, ${songPositions.length} orders`);
    if (totalNotes === 0) return null;
    const songName = title || filename.replace(/\.[^.]+$/, "");
    return {
      name: `${songName} [${type}]`,
      format: "AdPlug",
      patterns,
      instruments,
      songPositions,
      songLength: songPositions.length,
      restartPosition: restartPos,
      numChannels,
      initialSpeed: finalSpeed,
      initialBPM: finalBpm,
      adplugFileData: buffer.slice(0),
      adplugFileName: filename,
      adplugTicksPerRow: usedCapture ? Math.max(1, M._adplug_capture_get_ticks_per_row()) : void 0
    };
  } finally {
    M._adplug_shutdown();
    M._adplug_init(48e3);
  }
}
export {
  extractAdPlugPatterns,
  invalidateAdPlugModule
};

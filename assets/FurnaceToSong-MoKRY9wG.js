const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css","assets/FurnaceSequencerSerializer-B1PNyF6W.js"])))=>i.map(i=>d[i]);
import { am as __vitePreload } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function furnaceNoteToXM(note) {
  if (note < 0 || note === 252) return 0;
  if (note === 253 || note === 254 || note === 255) return 97;
  if (note < 1) return 0;
  if (note > 96) return 96;
  return note;
}
function furnaceVolToXM(vol) {
  if (vol < 0) return 0;
  return 16 + Math.min(64, Math.round(vol * 64 / 127));
}
function mapFurnaceEffectToXM(cmd) {
  if (cmd < 0) return 0;
  const mapping = {
    0: 0,
    // Arpeggio
    1: 1,
    // Portamento up
    2: 2,
    // Portamento down
    3: 3,
    // Tone portamento
    4: 4,
    // Vibrato
    5: 5,
    // Volslide + tone porta
    6: 6,
    // Volslide + vibrato
    7: 7,
    // Tremolo
    8: 8,
    // Panning
    9: 15,
    // Set speed (groove)
    10: 10,
    // Volume slide
    11: 11,
    // Jump to order
    12: 12,
    // Set volume
    13: 13,
    // Pattern break
    15: 15,
    // Set speed
    14: 14,
    // Extended effects
    // Furnace extended effects — pass through for WASM dispatch
    225: 225,
    // Note slide up
    226: 226,
    // Note slide down
    227: 227,
    // Vibrato mode
    228: 228,
    // Fine vibrato depth
    229: 229,
    // Fine pitch
    230: 230,
    // Legato mode
    231: 231,
    // Samp offs (high byte)
    232: 232,
    // Macro release
    233: 233,
    // Note retrigger
    234: 234,
    // Fine volslide up
    235: 235,
    // Fine volslide down
    236: 236,
    // Note cut
    237: 237,
    // Note delay
    238: 238,
    // Delayed pattern change
    239: 239
    // Set BPM
  };
  if (cmd in mapping) return mapping[cmd];
  return cmd;
}
function furnaceRowToTrackerCell(row) {
  const note = furnaceNoteToXM(row.note);
  const instrument = row.ins >= 0 ? row.ins + 1 : 0;
  const volume = furnaceVolToXM(row.vol);
  const convertEffect = (i) => {
    const fx = row.effects[i];
    if (!fx || fx.cmd < 0 && fx.val < 0) return { type: 0, param: 0 };
    let t = mapFurnaceEffectToXM(fx.cmd < 0 ? 0 : fx.cmd);
    let p = fx.val >= 0 ? fx.val & 255 : 0;
    if (t >= 224 && t <= 239) {
      const subCmd = t & 15;
      t = 14;
      p = subCmd << 4 | p & 15;
    }
    return { type: t, param: p };
  };
  const e0 = convertEffect(0);
  const e1 = convertEffect(1);
  const cell = {
    note,
    instrument,
    volume,
    effTyp: e0.type,
    eff: e0.param,
    effTyp2: e1.type,
    eff2: e1.param
  };
  for (let i = 2; i < Math.min(8, row.effects.length); i++) {
    const e = convertEffect(i);
    if (e.type || e.param) {
      const idx = i + 1;
      cell[`effTyp${idx}`] = e.type;
      cell[`eff${idx}`] = e.param;
    }
  }
  return cell;
}
function subsongToPatterns(sub) {
  const ordersLen = sub.ordersLen;
  const songPositions = [];
  const patterns = [];
  const patternCache = /* @__PURE__ */ new Map();
  for (let pos = 0; pos < ordersLen; pos++) {
    const key = sub.orders.map((chOrders) => chOrders[pos]).join(",");
    if (patternCache.has(key)) {
      songPositions.push(patternCache.get(key));
      continue;
    }
    const patIdx = patterns.length;
    patternCache.set(key, patIdx);
    songPositions.push(patIdx);
    const channels = sub.channels.map((chData, ch) => {
      const orderPatIdx = sub.orders[ch][pos];
      const patData = chData.patterns.get(orderPatIdx);
      const rows = [];
      for (let row = 0; row < sub.patLen; row++) {
        if (patData && patData.rows[row]) {
          rows.push(furnaceRowToTrackerCell(patData.rows[row]));
        } else {
          rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
        }
      }
      return {
        id: `channel-${ch}`,
        name: chData.name || `Channel ${ch + 1}`,
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
      length: sub.patLen,
      channels
    });
  }
  return { patterns, songPositions };
}
function computeBPM(sub) {
  const hz = sub.hz || 60;
  const vN = sub.virtualTempoN || 150;
  const vD = sub.virtualTempoD || 150;
  return Math.round(hz * 2.5 * vN / vD);
}
async function parseFurnaceFile(buffer, _fileName, subsong = 0) {
  console.log(`[FurnaceToSong] parseFurnaceFile: "${_fileName}", ${buffer.byteLength} bytes, subsong=${subsong}`);
  try {
    const result = await parseFurnaceFileWasm(buffer, _fileName, subsong);
    console.log(`[FurnaceToSong] WASM success: ${result.patterns.length} patterns, ${result.instruments.length} instruments`);
    return result;
  } catch (err) {
    const bytes = new Uint8Array(buffer);
    const isDefleMask = bytes.length > 4 && bytes[0] === 46 && bytes[1] === 68 && bytes[2] === 101;
    if (isDefleMask) {
      throw new Error(`DefleMask import requires Furnace WASM engine (WASM error: ${err})`);
    }
    console.warn("[FurnaceToSong] WASM parser failed, falling back to TS parser:", err);
    try {
      const result = await parseFurnaceFileTS(buffer, _fileName, subsong);
      console.log(`[FurnaceToSong] TS fallback success: ${result.patterns.length} patterns, ${result.instruments.length} instruments`);
      return result;
    } catch (tsErr) {
      console.error("[FurnaceToSong] Both WASM and TS parsers failed!", { wasmErr: err, tsErr });
      throw tsErr;
    }
  }
}
async function parseFurnaceFileWasm(buffer, _fileName, subsong = 0) {
  var _a, _b;
  const { loadFurFileWasm } = await __vitePreload(async () => {
    const { loadFurFileWasm: loadFurFileWasm2 } = await import("./FurnaceFileOps-c7uBibmq.js");
    return { loadFurFileWasm: loadFurFileWasm2 };
  }, true ? [] : void 0);
  const { convertToInstrument } = await __vitePreload(async () => {
    const { convertToInstrument: convertToInstrument2 } = await import("./main-BbV5VyEH.js").then((n) => n.jk);
    return { convertToInstrument: convertToInstrument2 };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
  const { parseInstrument } = await __vitePreload(async () => {
    const { parseInstrument: parseInstrument2 } = await import("./main-BbV5VyEH.js").then((n) => n.j3);
    return { parseInstrument: parseInstrument2 };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
  const { mapFurnaceInstrumentType } = await __vitePreload(async () => {
    const { mapFurnaceInstrumentType: mapFurnaceInstrumentType2 } = await import("./main-BbV5VyEH.js").then((n) => n.jn);
    return { mapFurnaceInstrumentType: mapFurnaceInstrumentType2 };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
  const { BinaryReader } = await __vitePreload(async () => {
    const { BinaryReader: BinaryReader2 } = await import("./main-BbV5VyEH.js").then((n) => n.i$);
    return { BinaryReader: BinaryReader2 };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
  const loaded = await loadFurFileWasm(buffer);
  const instruments = [];
  for (let i = 0; i < loaded.instrumentBinaries.length; i++) {
    const binary = loaded.instrumentBinaries[i];
    if (binary.length < 8) {
      instruments.push({ id: i + 1, name: `Instrument ${i}`, type: "synth", synthType: "ChipSynth", config: {} });
      continue;
    }
    try {
      const reader = new BinaryReader(binary.buffer);
      const furIns = parseInstrument(reader);
      const synthType = mapFurnaceInstrumentType(furIns.type);
      const parsed = {
        id: i + 1,
        name: furIns.name || `Instrument ${i}`,
        samples: [],
        fadeout: 0,
        volumeType: "none",
        panningType: "none",
        rawBinaryData: binary,
        furnace: {
          chipType: furIns.type,
          synthType,
          fm: furIns.fm,
          macros: (furIns.macros || []).map((m) => ({
            code: m.code,
            type: m.type,
            data: m.data,
            loop: m.loop ?? -1,
            release: m.release ?? -1,
            mode: m.mode ?? 0,
            delay: m.delay ?? 0,
            speed: m.speed ?? 1
          })),
          wavetables: (furIns.wavetables || []).map((wtIndex, wi) => ({
            id: wi,
            data: [],
            len: 0,
            max: 0,
            index: wtIndex
          })),
          amiga: furIns.amiga,
          opMacroArrays: (_a = furIns.opMacroArrays) == null ? void 0 : _a.map(
            (ops) => ops.map((m) => ({
              code: m.code,
              type: m.type,
              data: m.data,
              loop: m.loop ?? -1,
              release: m.release ?? -1,
              mode: m.mode ?? 0,
              delay: m.delay ?? 0,
              speed: m.speed ?? 1
            }))
          ),
          chipConfig: {
            ...furIns.gb ? { gb: furIns.gb } : {},
            ...furIns.c64 ? { c64: furIns.c64 } : {},
            ...furIns.snes ? { snes: furIns.snes } : {},
            ...furIns.n163 ? { n163: furIns.n163 } : {},
            ...furIns.fds ? { fds: furIns.fds } : {},
            ...furIns.es5506 ? { es5506: furIns.es5506 } : {},
            ...furIns.multipcm ? { multipcm: furIns.multipcm } : {},
            ...furIns.soundUnit ? { soundUnit: furIns.soundUnit } : {},
            ...furIns.esfm ? { esfm: furIns.esfm } : {},
            ...furIns.powerNoise ? { powerNoise: furIns.powerNoise } : {},
            ...furIns.sid2 ? { sid2: furIns.sid2 } : {}
          }
        }
      };
      const converted = convertToInstrument(parsed, i + 1, "FUR");
      instruments.push(...converted.map((inst, j) => ({ ...inst, id: i + 1 + j })));
    } catch (err) {
      console.warn(`[FurnaceToSong] Failed to parse instrument ${i}:`, err);
      instruments.push({ id: i + 1, name: `Instrument ${i}`, type: "synth", synthType: "ChipSynth", config: {} });
    }
  }
  const activeSub = loaded.nativeData.subsongs[subsong] || loaded.nativeData.subsongs[0];
  const { patterns, songPositions } = subsongToPatterns(activeSub);
  const numChannels = activeSub.channels.length;
  if (loaded.wavetables.length > 0 || loaded.samples.length > 0) {
    const { FurnaceDispatchEngine } = await __vitePreload(async () => {
      const { FurnaceDispatchEngine: FurnaceDispatchEngine2 } = await import("./main-BbV5VyEH.js").then((n) => n.iO);
      return { FurnaceDispatchEngine: FurnaceDispatchEngine2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const engine = FurnaceDispatchEngine.getInstance();
    engine.setModuleWavetables(loaded.wavetables.length > 0 ? loaded.wavetables : null);
    engine.setModuleSamples(loaded.samples.length > 0 ? loaded.samples : null);
  }
  try {
    const { FurnaceDispatchEngine } = await __vitePreload(async () => {
      const { FurnaceDispatchEngine: FurnaceDispatchEngine2 } = await import("./main-BbV5VyEH.js").then((n) => n.iO);
      return { FurnaceDispatchEngine: FurnaceDispatchEngine2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    if (FurnaceDispatchEngine.getInstance().isInitialized) {
      const { uploadFurnaceToSequencer } = await __vitePreload(async () => {
        const { uploadFurnaceToSequencer: uploadFurnaceToSequencer2 } = await import("./FurnaceSequencerSerializer-B1PNyF6W.js");
        return { uploadFurnaceToSequencer: uploadFurnaceToSequencer2 };
      }, true ? __vite__mapDeps([7,0,1,2,3,4,5,6]) : void 0);
      await uploadFurnaceToSequencer(loaded.nativeData, subsong);
      console.log("[FurnaceToSong] WASM-parsed song uploaded to WASM sequencer");
    }
  } catch (err) {
    console.warn("[FurnaceToSong] Failed to upload to WASM sequencer:", err);
  }
  const furnaceSubsongs = loaded.numSubsongs > 1 ? loaded.nativeData.subsongs.map((sub, i) => {
    var _a2;
    const converted = subsongToPatterns(sub);
    return {
      name: sub.name || `Subsong ${i + 1}`,
      patterns: converted.patterns,
      songPositions: converted.songPositions,
      initialSpeed: sub.speed1,
      initialBPM: computeBPM(sub),
      speed2: sub.speed2,
      hz: sub.hz,
      virtualTempoN: sub.virtualTempoN,
      virtualTempoD: sub.virtualTempoD,
      grooves: (_a2 = loaded.nativeData.grooves) == null ? void 0 : _a2.map((g) => g.val)
    };
  }) : void 0;
  console.log(`[FurnaceToSong] WASM parsed: "${loaded.name}", ${numChannels} channels, ${patterns.length} patterns, ${loaded.numSubsongs} subsongs`);
  return {
    name: loaded.name || _fileName.replace(/\.[^/.]+$/, ""),
    format: "XM",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: activeSub.speed1,
    initialBPM: computeBPM(activeSub),
    speed2: activeSub.speed2,
    hz: activeSub.hz,
    virtualTempoN: activeSub.virtualTempoN,
    virtualTempoD: activeSub.virtualTempoD,
    grooves: (_b = loaded.nativeData.grooves) == null ? void 0 : _b.map((g) => g.val),
    furnaceWavetables: loaded.wavetables.length > 0 ? loaded.wavetables : void 0,
    furnaceSamples: loaded.samples.length > 0 ? loaded.samples : void 0,
    furnaceNative: loaded.nativeData,
    furnaceSubsongs,
    furnaceActiveSubsong: subsong
  };
}
async function parseFurnaceFileTS(buffer, _fileName, subsong = 0) {
  var _a, _b, _c, _d, _e, _f;
  const { parseFurnaceSong, convertFurnaceToDevilbox, convertSubsongForPlayback } = await __vitePreload(async () => {
    const { parseFurnaceSong: parseFurnaceSong2, convertFurnaceToDevilbox: convertFurnaceToDevilbox2, convertSubsongForPlayback: convertSubsongForPlayback2 } = await import("./main-BbV5VyEH.js").then((n) => n.jn);
    return { parseFurnaceSong: parseFurnaceSong2, convertFurnaceToDevilbox: convertFurnaceToDevilbox2, convertSubsongForPlayback: convertSubsongForPlayback2 };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
  const { convertToInstrument } = await __vitePreload(async () => {
    const { convertToInstrument: convertToInstrument2 } = await import("./main-BbV5VyEH.js").then((n) => n.jk);
    return { convertToInstrument: convertToInstrument2 };
  }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
  const module = await parseFurnaceSong(buffer);
  const result = convertFurnaceToDevilbox(module, subsong);
  const instruments = result.instruments.map((inst, idx) => convertToInstrument(inst, idx + 1, "FUR")).flat().map((inst, i) => ({ ...inst, id: i + 1 }));
  const patternOrder = ((_a = result.metadata.modData) == null ? void 0 : _a.patternOrderTable) || [];
  const patterns = result.patterns;
  const patLen = ((_b = patterns[0]) == null ? void 0 : _b.length) || 64;
  const numChannels = ((_d = (_c = patterns[0]) == null ? void 0 : _c[0]) == null ? void 0 : _d.length) || 4;
  const convertedPatterns = patterns.map((pat, idx) => ({
    id: `pattern-${idx}`,
    name: `Pattern ${idx}`,
    length: patLen,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: pat.map((row) => {
        const cell = row[ch] || {};
        const trackerCell = {
          note: cell.note || 0,
          instrument: cell.instrument || 0,
          volume: cell.volume || 0,
          effTyp: cell.effectType || 0,
          eff: cell.effectParam || 0,
          effTyp2: cell.effectType2 || 0,
          eff2: cell.effectParam2 || 0
        };
        if (cell.effectType3 || cell.effectParam3) {
          trackerCell.effTyp3 = cell.effectType3 || 0;
          trackerCell.eff3 = cell.effectParam3 || 0;
        }
        if (cell.effectType4 || cell.effectParam4) {
          trackerCell.effTyp4 = cell.effectType4 || 0;
          trackerCell.eff4 = cell.effectParam4 || 0;
        }
        if (cell.effectType5 || cell.effectParam5) {
          trackerCell.effTyp5 = cell.effectType5 || 0;
          trackerCell.eff5 = cell.effectParam5 || 0;
        }
        if (cell.effectType6 || cell.effectParam6) {
          trackerCell.effTyp6 = cell.effectType6 || 0;
          trackerCell.eff6 = cell.effectParam6 || 0;
        }
        if (cell.effectType7 || cell.effectParam7) {
          trackerCell.effTyp7 = cell.effectType7 || 0;
          trackerCell.eff7 = cell.effectParam7 || 0;
        }
        if (cell.effectType8 || cell.effectParam8) {
          trackerCell.effTyp8 = cell.effectType8 || 0;
          trackerCell.eff8 = cell.effectParam8 || 0;
        }
        return trackerCell;
      })
    }))
  }));
  if (result.wavetables.length > 0 || result.samples.length > 0) {
    const { FurnaceDispatchEngine } = await __vitePreload(async () => {
      const { FurnaceDispatchEngine: FurnaceDispatchEngine2 } = await import("./main-BbV5VyEH.js").then((n) => n.iO);
      return { FurnaceDispatchEngine: FurnaceDispatchEngine2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const engine = FurnaceDispatchEngine.getInstance();
    engine.setModuleWavetables(result.wavetables.length > 0 ? result.wavetables : null);
    engine.setModuleSamples(result.samples.length > 0 ? result.samples : null);
  }
  if (result.furnaceNative) {
    try {
      const { FurnaceDispatchEngine } = await __vitePreload(async () => {
        const { FurnaceDispatchEngine: FurnaceDispatchEngine2 } = await import("./main-BbV5VyEH.js").then((n) => n.iO);
        return { FurnaceDispatchEngine: FurnaceDispatchEngine2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
      if (FurnaceDispatchEngine.getInstance().isInitialized) {
        const { uploadFurnaceToSequencer } = await __vitePreload(async () => {
          const { uploadFurnaceToSequencer: uploadFurnaceToSequencer2 } = await import("./FurnaceSequencerSerializer-B1PNyF6W.js");
          return { uploadFurnaceToSequencer: uploadFurnaceToSequencer2 };
        }, true ? __vite__mapDeps([7,0,1,2,3,4,5,6]) : void 0);
        await uploadFurnaceToSequencer(result.furnaceNative, subsong);
        console.log("[FurnaceToSong] Song uploaded to WASM sequencer (TS fallback)");
      }
    } catch (err) {
      console.warn("[FurnaceToSong] Failed to upload to WASM sequencer, falling back to TS replayer:", err);
    }
  }
  function cellsToPatterns(rawPats, rowLen, numCh, prefix) {
    return rawPats.map((pat, idx) => ({
      id: `${prefix}-${idx}`,
      name: `Pattern ${idx}`,
      length: rowLen,
      channels: Array.from({ length: numCh }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: 0,
        instrumentId: null,
        color: null,
        rows: pat.map((row) => {
          const cell = row[ch] || {};
          const tc = {
            note: cell.note || 0,
            instrument: cell.instrument || 0,
            volume: cell.volume || 0,
            effTyp: cell.effectType || 0,
            eff: cell.effectParam || 0,
            effTyp2: cell.effectType2 || 0,
            eff2: cell.effectParam2 || 0
          };
          if (cell.effectType3 || cell.effectParam3) {
            tc.effTyp3 = cell.effectType3 || 0;
            tc.eff3 = cell.effectParam3 || 0;
          }
          if (cell.effectType4 || cell.effectParam4) {
            tc.effTyp4 = cell.effectType4 || 0;
            tc.eff4 = cell.effectParam4 || 0;
          }
          if (cell.effectType5 || cell.effectParam5) {
            tc.effTyp5 = cell.effectType5 || 0;
            tc.eff5 = cell.effectParam5 || 0;
          }
          if (cell.effectType6 || cell.effectParam6) {
            tc.effTyp6 = cell.effectType6 || 0;
            tc.eff6 = cell.effectParam6 || 0;
          }
          if (cell.effectType7 || cell.effectParam7) {
            tc.effTyp7 = cell.effectType7 || 0;
            tc.eff7 = cell.effectParam7 || 0;
          }
          if (cell.effectType8 || cell.effectParam8) {
            tc.effTyp8 = cell.effectType8 || 0;
            tc.eff8 = cell.effectParam8 || 0;
          }
          return tc;
        })
      }))
    }));
  }
  const furnaceSubsongs = module.subsongs.map((_, i) => {
    var _a2, _b2, _c2, _d2, _e2, _f2, _g, _h, _i, _j;
    const subResult = i === subsong ? result : convertSubsongForPlayback(module, i);
    const subMeta = subResult.metadata;
    const subPatterns = subResult.patterns;
    const subPatLen = ((_a2 = module.subsongs[i]) == null ? void 0 : _a2.patLen) || patLen;
    return {
      name: ((_b2 = module.subsongs[i]) == null ? void 0 : _b2.name) || `Subsong ${i + 1}`,
      patterns: cellsToPatterns(subPatterns, subPatLen, numChannels, `sub${i}`),
      songPositions: ((_c2 = subMeta.modData) == null ? void 0 : _c2.patternOrderTable) ?? Array.from({ length: subPatterns.length }, (_2, j) => j),
      initialSpeed: ((_d2 = subMeta.modData) == null ? void 0 : _d2.initialSpeed) ?? 6,
      initialBPM: ((_e2 = subMeta.modData) == null ? void 0 : _e2.initialBPM) ?? 125,
      speed2: ((_f2 = subMeta.furnaceData) == null ? void 0 : _f2.speed2) || void 0,
      hz: ((_g = subMeta.furnaceData) == null ? void 0 : _g.hz) || void 0,
      virtualTempoN: ((_h = subMeta.furnaceData) == null ? void 0 : _h.virtualTempoN) || void 0,
      virtualTempoD: ((_i = subMeta.furnaceData) == null ? void 0 : _i.virtualTempoD) || void 0,
      grooves: (_j = subMeta.furnaceData) == null ? void 0 : _j.grooves
    };
  });
  const furnaceData = result.metadata.furnaceData;
  return {
    name: result.metadata.sourceFile.replace(/\.[^/.]+$/, ""),
    format: "XM",
    patterns: convertedPatterns,
    instruments,
    songPositions: patternOrder.length > 0 ? patternOrder : convertedPatterns.map((_, i) => i),
    songLength: patternOrder.length || convertedPatterns.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: ((_e = result.metadata.modData) == null ? void 0 : _e.initialSpeed) ?? 6,
    initialBPM: ((_f = result.metadata.modData) == null ? void 0 : _f.initialBPM) ?? 125,
    speed2: furnaceData == null ? void 0 : furnaceData.speed2,
    hz: furnaceData == null ? void 0 : furnaceData.hz,
    virtualTempoN: furnaceData == null ? void 0 : furnaceData.virtualTempoN,
    virtualTempoD: furnaceData == null ? void 0 : furnaceData.virtualTempoD,
    compatFlags: furnaceData == null ? void 0 : furnaceData.compatFlags,
    grooves: furnaceData == null ? void 0 : furnaceData.grooves,
    furnaceWavetables: result.wavetables.length > 0 ? result.wavetables : void 0,
    furnaceSamples: result.samples.length > 0 ? result.samples : void 0,
    furnaceNative: result.furnaceNative,
    furnaceSubsongs: module.subsongs.length > 1 ? furnaceSubsongs : void 0,
    furnaceActiveSubsong: subsong
  };
}
export {
  parseFurnaceFile
};

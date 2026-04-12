const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/main-BbV5VyEH.js","assets/client-DHYdgbIN.js","assets/vendor-ui-AJ7AT9BN.js","assets/vendor-react-Dgd_wxYf.js","assets/vendor-utils-a-Usm5Xm.js","assets/vendor-tone-48TQc1H3.js","assets/main-c6CPs1E0.css","assets/AutomationBaker-fv7yT9k7.js"])))=>i.map(i=>d[i]);
import { am as __vitePreload } from "./main-BbV5VyEH.js";
import { createNewModule, setInitialSpeed, setInitialTempo, resizePattern, setPatternCell, setOrderPattern, setSampleData, saveModule, destroyModule } from "./OpenMPTSoundlib-RubRPKN7.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function mapEffectToOpenMPT(effTyp, eff) {
  switch (effTyp) {
    case 0:
      return eff === 0 ? { cmd: 0, param: 0 } : { cmd: 1, param: eff };
    // Arpeggio or empty
    case 1:
      return { cmd: 2, param: eff };
    // PortaUp → CMD_PORTAMENTOUP
    case 2:
      return { cmd: 3, param: eff };
    // PortaDown → CMD_PORTAMENTODOWN
    case 3:
      return { cmd: 4, param: eff };
    // TonePorta → CMD_TONEPORTAMENTO
    case 4:
      return { cmd: 5, param: eff };
    // Vibrato → CMD_VIBRATO
    case 5:
      return { cmd: 6, param: eff };
    // TonePortaVol → CMD_TONEPORTAVOL
    case 6:
      return { cmd: 7, param: eff };
    // VibratoVol → CMD_VIBRATOVOL
    case 7:
      return { cmd: 8, param: eff };
    // Tremolo → CMD_TREMOLO
    case 8:
      return { cmd: 9, param: eff };
    // Panning → CMD_PANNING8
    case 9:
      return { cmd: 10, param: eff };
    // Offset → CMD_OFFSET
    case 10:
      return { cmd: 11, param: eff };
    // VolSlide → CMD_VOLUMESLIDE
    case 11:
      return { cmd: 12, param: eff };
    // PosJump → CMD_POSITIONJUMP
    case 12:
      return { cmd: 13, param: eff };
    // Volume → CMD_VOLUME
    case 13:
      return { cmd: 14, param: eff };
    // PatBreak → CMD_PATTERNBREAK
    case 14:
      return { cmd: 19, param: eff };
    // Extended → CMD_MODCMDEX
    case 15:
      return eff < 32 ? { cmd: 16, param: eff } : { cmd: 17, param: eff };
    // CMD_TEMPO
    case 16:
      return { cmd: 23, param: eff };
    // GlobalVol → CMD_GLOBALVOLUME
    case 17:
      return { cmd: 24, param: eff };
    // GlobalVolSlide → CMD_GLOBALVOLSLIDE
    case 20:
      return { cmd: 25, param: eff };
    // KeyOff → CMD_KEYOFF
    case 21:
      return { cmd: 30, param: eff };
    // SetEnvPos → CMD_SETENVPOSITION
    case 25:
      return { cmd: 29, param: eff };
    // PanSlide → CMD_PANNINGSLIDE
    case 27:
      return { cmd: 15, param: eff };
    // MultiRetrig → CMD_RETRIG
    case 29:
      return { cmd: 18, param: eff };
    // Tremor → CMD_TREMOR
    case 33:
      return { cmd: 28, param: eff };
    // ExtraFine → CMD_XFINEPORTAUPDOWN
    default:
      return { cmd: 0, param: 0 };
  }
}
function mapNoteToOpenMPT(note) {
  if (note === 0) return 0;
  if (note === 97) return 255;
  if (note >= 1 && note <= 96) return note;
  return 0;
}
function mapVolumeToOpenMPT(vol) {
  if (vol === 0) return { volcmd: 0, volval: 0 };
  if (vol >= 16 && vol <= 80) return { volcmd: 1, volval: vol - 16 };
  if (vol >= 96 && vol <= 111) return { volcmd: 3, volval: vol - 96 };
  if (vol >= 112 && vol <= 127) return { volcmd: 4, volval: vol - 112 };
  if (vol >= 128 && vol <= 143) return { volcmd: 5, volval: vol - 128 };
  if (vol >= 144 && vol <= 159) return { volcmd: 6, volval: vol - 144 };
  if (vol >= 160 && vol <= 175) return { volcmd: 7, volval: vol - 160 };
  if (vol >= 176 && vol <= 191) return { volcmd: 8, volval: vol - 176 };
  if (vol >= 192 && vol <= 207) return { volcmd: 2, volval: vol - 192 << 2 };
  if (vol >= 240 && vol <= 255) return { volcmd: 11, volval: vol - 240 };
  return { volcmd: 0, volval: 0 };
}
async function exportWithOpenMPT(patterns, instruments, songPositions, options) {
  var _a, _b, _c;
  const warnings = [];
  const format = options.format;
  const numChannels = options.channelLimit || ((_a = patterns[0]) == null ? void 0 : _a.channels.length) || 4;
  try {
    const { useAutomationStore } = await __vitePreload(async () => {
      const { useAutomationStore: useAutomationStore2 } = await import("./main-BbV5VyEH.js").then((n) => n.j5);
      return { useAutomationStore: useAutomationStore2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const { bakeAutomationForExport } = await __vitePreload(async () => {
      const { bakeAutomationForExport: bakeAutomationForExport2 } = await import("./AutomationBaker-fv7yT9k7.js");
      return { bakeAutomationForExport: bakeAutomationForExport2 };
    }, true ? __vite__mapDeps([7,0,1,2,3,4,5,6]) : void 0);
    const { FORMAT_LIMITS } = await __vitePreload(async () => {
      const { FORMAT_LIMITS: FORMAT_LIMITS2 } = await import("./main-BbV5VyEH.js").then((n) => n.i_);
      return { FORMAT_LIMITS: FORMAT_LIMITS2 };
    }, true ? __vite__mapDeps([0,1,2,3,4,5,6]) : void 0);
    const curves = useAutomationStore.getState().curves;
    if (curves.length > 0) {
      const formatKey = format.toUpperCase();
      const fmt = FORMAT_LIMITS[formatKey];
      if (fmt) {
        const bakeResult = bakeAutomationForExport(patterns, curves, fmt);
        patterns = bakeResult.patterns;
        if (bakeResult.bakedCount > 0) {
          warnings.push(`${bakeResult.bakedCount} automation curve(s) baked into ${formatKey} effects.`);
        }
        if (bakeResult.overflowRows > 0) {
          warnings.push(`${bakeResult.overflowRows} row(s) had no free effect slot — automation data lost on those rows.`);
        }
        for (const w of bakeResult.warnings) warnings.push(w);
      }
    }
  } catch {
  }
  const formatMap = { mod: 0, xm: 1, it: 2, s3m: 3 };
  const formatType = formatMap[format];
  const created = await createNewModule(
    formatType,
    numChannels,
    patterns.length
  );
  if (!created) throw new Error("Failed to create new OpenMPT module");
  try {
    await setInitialSpeed(options.initialSpeed ?? 6);
    await setInitialTempo(options.initialBPM ?? 125);
    for (let p = 0; p < patterns.length; p++) {
      const pat = patterns[p];
      const numRows = pat.length || 64;
      await resizePattern(p, numRows);
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < Math.min(numChannels, pat.channels.length); c++) {
          const cell = (_b = pat.channels[c]) == null ? void 0 : _b.rows[r];
          if (!cell) continue;
          const note = mapNoteToOpenMPT(cell.note);
          const { volcmd, volval } = mapVolumeToOpenMPT(cell.volume);
          const fx = mapEffectToOpenMPT(cell.effTyp, cell.eff);
          if (note || cell.instrument || volcmd || fx.cmd) {
            const patCell = {
              note,
              instrument: cell.instrument,
              volcmd,
              vol: volval,
              command: fx.cmd,
              param: fx.param
            };
            await setPatternCell(p, r, c, patCell);
          }
        }
      }
    }
    for (let i = 0; i < songPositions.length; i++) {
      await setOrderPattern(i, songPositions[i]);
    }
    for (let i = 0; i < instruments.length; i++) {
      const inst = instruments[i];
      if (!((_c = inst.sample) == null ? void 0 : _c.audioBuffer) || inst.sample.audioBuffer.byteLength === 0) continue;
      try {
        const sampleRate = inst.sample.sampleRate || 8363;
        const data = new Int16Array(inst.sample.audioBuffer);
        if (data.length > 0) {
          await setSampleData(i + 1, data, sampleRate, false);
        }
      } catch {
        warnings.push(`Failed to write sample data for instrument ${i + 1} "${inst.name}"`);
      }
    }
    const result = await saveModule(format);
    if (!result) throw new Error(`OpenMPT: Failed to save as ${format.toUpperCase()}`);
    const ext = format === "mod" ? "mod" : format;
    const filename = `${options.moduleName.replace(/[^\w\s-]/g, "").trim() || "export"}.${ext}`;
    return {
      data: new Blob([result], { type: "application/octet-stream" }),
      filename,
      warnings
    };
  } finally {
    await destroyModule();
  }
}
export {
  exportWithOpenMPT
};

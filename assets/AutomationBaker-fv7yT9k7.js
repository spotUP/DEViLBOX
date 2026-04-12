import { bP as interpolateAutomationValue } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function norm(v, max) {
  return Math.round(Math.max(0, Math.min(1, v)) * max);
}
function hasVolumeColumn(format) {
  return format.name !== "MOD" && format.name !== "FC" && format.name !== "HVL" && format.name !== "AHX";
}
function hasExtendedEffects(format) {
  return format.name !== "MOD";
}
function maxEffectSlots(format) {
  if (format.name === "IT") return 8;
  if (format.name === "MOD") return 1;
  return 2;
}
function writeEffect(cell, effTyp, eff, format) {
  const slots = maxEffectSlots(format);
  if (cell.effTyp === 0 && cell.eff === 0) {
    cell.effTyp = effTyp;
    cell.eff = eff;
    return true;
  }
  if (slots >= 2 && (cell.effTyp2 === 0 || cell.effTyp2 === void 0) && (cell.eff2 === 0 || cell.eff2 === void 0)) {
    cell.effTyp2 = effTyp;
    cell.eff2 = eff;
    return true;
  }
  if (slots >= 3) {
    const slotPairs = [
      ["effTyp3", "eff3"],
      ["effTyp4", "eff4"],
      ["effTyp5", "eff5"],
      ["effTyp6", "eff6"],
      ["effTyp7", "eff7"],
      ["effTyp8", "eff8"]
    ];
    for (const [typKey, effKey] of slotPairs) {
      const typ = cell[typKey];
      const ef = cell[effKey];
      if ((typ === 0 || typ === void 0) && (ef === 0 || ef === void 0)) {
        cell[typKey] = effTyp;
        cell[effKey] = eff;
        return true;
      }
    }
  }
  return false;
}
function writePanToVolumeColumn(cell, panNorm) {
  if (cell.volume !== 0 && cell.volume !== void 0) return false;
  const nibble = Math.round(Math.max(0, Math.min(1, panNorm)) * 15);
  cell.volume = 192 + nibble;
  return true;
}
function absEffect(effNum, maxVal) {
  return {
    write: (cell, v, prevValue, fmt) => {
      const val = norm(v, maxVal);
      if (prevValue !== null && norm(prevValue, maxVal) === val) return true;
      return writeEffect(cell, effNum, val, fmt);
    }
  };
}
function slideEffect(upEff, downEff) {
  return {
    write: (cell, v, prevValue, fmt) => {
      if (prevValue === null) return true;
      const delta = v - prevValue;
      if (Math.abs(delta) < 2e-3) return true;
      const speed = Math.min(255, Math.round(Math.abs(delta) * 255));
      if (speed === 0) return true;
      return writeEffect(cell, delta > 0 ? upEff : downEff, speed, fmt);
    }
  };
}
function opNibbleEffect(effNum, maxPerOp) {
  return {
    write: (cell, v, prevValue, fmt) => {
      const val = norm(v, maxPerOp);
      if (prevValue !== null && norm(prevValue, maxPerOp) === val) return true;
      return writeEffect(cell, effNum, val, fmt);
    }
  };
}
function getC64EffectMapping(p) {
  if (p.includes("pulse") || p.includes("duty") || p.includes("fineduty")) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const pw = norm(v, 4095);
        if (prevValue !== null && norm(prevValue, 4095) === pw) return true;
        return writeEffect(cell, 48 + (pw >> 8 & 15), pw & 255, fmt);
      }
    };
  }
  if (p.includes("cutoff") || p.includes("filter") && !p.includes("filterselect") && !p.includes("filtermode")) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const cutoff = norm(v, 2047);
        if (prevValue !== null && norm(prevValue, 2047) === cutoff) return true;
        return writeEffect(cell, 64 + (cutoff >> 8 & 7), cutoff & 255, fmt);
      }
    };
  }
  if (p.includes("resonance") || p.includes("reso")) return absEffect(19, 15);
  if (p.includes("filtermode") || p.includes("filter_mode")) return absEffect(20, 7);
  if (p.includes("waveform") || p.includes("wave")) return absEffect(16, 255);
  if (p.includes("attack") && p.includes("decay") || p === "ad" || p.endsWith(".ad")) return absEffect(32, 255);
  if (p.includes("sustain") && p.includes("release") || p === "sr" || p.endsWith(".sr")) return absEffect(33, 255);
  if (p.includes("pwslide") || p.includes("pulse_slide")) return slideEffect(34, 35);
  if (p.includes("cutoffslide") || p.includes("cutoff_slide") || p.includes("filterslide")) return slideEffect(36, 37);
  if (p.includes("envreset") || p.includes("resettime")) return absEffect(21, 255);
  return null;
}
function getAYEffectMapping(p) {
  if (p.includes("noise") || p.includes("duty")) return absEffect(18, 31);
  if (p.includes("channelmode") || p.includes("noisemode")) return absEffect(32, 7);
  if (p.includes("envshape") || p.includes("envelope_shape")) return absEffect(34, 255);
  if (p.includes("envperiod") || p.includes("envelope_period")) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const period = norm(v, 65535);
        if (prevValue !== null && norm(prevValue, 65535) === period) return true;
        const wroteLo = writeEffect(cell, 35, period & 255, fmt);
        const wroteHi = writeEffect(cell, 36, period >> 8 & 255, fmt);
        return wroteLo || wroteHi;
      }
    };
  }
  if (p.includes("envslide") || p.includes("envelope_slide")) return slideEffect(37, 38);
  if (p.includes("autopwm") || p.includes("auto_pwm")) return absEffect(44, 255);
  return null;
}
function getFMEffectMapping(p, chipType) {
  if (p.includes("feedback") || p.includes(".fb")) return absEffect(17, 7);
  if (p.includes("algorithm") || p.includes(".alg")) return absEffect(97, 7);
  if (p.includes("tl1") || p.includes("totallevel1") || p.includes("op1level")) return absEffect(18, 127);
  if (p.includes("tl2") || p.includes("totallevel2") || p.includes("op2level")) return absEffect(19, 127);
  if (p.includes("tl3") || p.includes("totallevel3") || p.includes("op3level")) return absEffect(20, 127);
  if (p.includes("tl4") || p.includes("totallevel4") || p.includes("op4level")) return absEffect(21, 127);
  if (p.includes("mult") || p.includes("multiplier")) return opNibbleEffect(22, 255);
  if (p.includes("attackrate") || p.includes("ar")) return absEffect(25, 31);
  if (p.includes("decayrate") || p.includes(".dr")) return absEffect(86, 31);
  if (p.includes("sustainlevel") || p.includes(".sl")) return opNibbleEffect(81, 255);
  if (p.includes("releaserate") || p.includes(".rr")) return opNibbleEffect(82, 255);
  if (p.includes("d2r") || p.includes("secondarydecay")) return absEffect(91, 31);
  if (p.includes("detune") && !p.includes("detune2")) return opNibbleEffect(83, 255);
  if (p.includes("ratescal") || p.includes(".rs") || p.includes("keyscal")) return opNibbleEffect(84, 255);
  if (p.includes("amenable") || p.includes("ampmod")) return opNibbleEffect(80, 255);
  if (p.includes("fms") || p.includes("fmdepth") || p.includes("fm_sensitivity")) return absEffect(98, 7);
  if (p.includes("ams") || p.includes("amdepth") || p.includes("am_sensitivity")) return absEffect(99, 3);
  if (chipType === "opm" || chipType === "arcade") {
    if (p.includes("lfospeed") || p.includes("lfo_speed")) return absEffect(23, 255);
    if (p.includes("lfowave") || p.includes("lfo_wave")) return absEffect(24, 3);
    if (p.includes("pmdepth") || p.includes("pm_depth") || p.includes("vibratodepth")) return absEffect(31, 127);
    if (p.includes("amlfo") || p.includes("am_depth")) return absEffect(30, 127);
    if (p.includes("detune2") || p.includes("dt2")) return opNibbleEffect(85, 255);
  }
  if (chipType === "opl" || chipType === "opl2" || chipType === "opl3") {
    if (p.includes("waveselect") || p.includes("waveform")) return opNibbleEffect(42, 255);
  }
  if (chipType === "esfm") {
    if (p.includes("waveselect") || p.includes("waveform")) return opNibbleEffect(42, 255);
    if (p.includes("oppan") || p.includes("op_pan") || p.includes("operatorpan")) return absEffect(32, 255);
    if (p.includes("outlevel") || p.includes("outputlevel")) return opNibbleEffect(36, 255);
    if (p.includes("modinput") || p.includes("modin")) return opNibbleEffect(37, 255);
    if (p.includes("envdelay") || p.includes("envelope_delay")) return opNibbleEffect(38, 255);
  }
  if (chipType === "opll" || chipType === "vrc7") {
    if (p.includes("patch") || p.includes("waveform")) return absEffect(16, 15);
  }
  return null;
}
function getGBEffectMapping(p) {
  if (p.includes("waveform") || p.includes("wave")) return absEffect(16, 3);
  if (p.includes("duty") || p.includes("pulse")) return absEffect(18, 3);
  if (p.includes("sweeptime") || p.includes("sweep_time")) return absEffect(19, 7);
  if (p.includes("sweepdir") || p.includes("sweep_dir")) return absEffect(20, 1);
  if (p.includes("noisemode") || p.includes("noise")) return absEffect(17, 255);
  return null;
}
function getNESEffectMapping(p) {
  if (p.includes("duty") || p.includes("noisemode") || p.includes("noise_mode")) return absEffect(18, 3);
  if (p.includes("envmode") || p.includes("envelope_mode")) return absEffect(21, 255);
  if (p.includes("lengthcounter") || p.includes("length")) return absEffect(22, 255);
  if (p.includes("linearcounter") || p.includes("linear")) return absEffect(25, 255);
  return null;
}
function getFDSEffectMapping(p) {
  if (p.includes("waveform") || p.includes("wave")) return absEffect(16, 255);
  if (p.includes("moddepth") || p.includes("mod_depth") || p.includes("fmdepth")) return absEffect(17, 255);
  if (p.includes("modspeed") || p.includes("mod_speed")) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const speed = norm(v, 65535);
        if (prevValue !== null && norm(prevValue, 65535) === speed) return true;
        const wroteHi = writeEffect(cell, 18, speed >> 8 & 255, fmt);
        const wroteLo = writeEffect(cell, 19, speed & 255, fmt);
        return wroteHi || wroteLo;
      }
    };
  }
  if (p.includes("modpos") || p.includes("mod_pos")) return absEffect(20, 255);
  if (p.includes("modwave") || p.includes("mod_wave")) return absEffect(21, 255);
  return null;
}
function getPCEEffectMapping(p) {
  if (p.includes("waveform") || p.includes("wave")) return absEffect(16, 255);
  if (p.includes("noise") || p.includes("duty")) return absEffect(17, 255);
  if (p.includes("lfomode") || p.includes("lfo_mode")) return absEffect(18, 255);
  if (p.includes("lfospeed") || p.includes("lfo_speed")) return absEffect(19, 255);
  return null;
}
function getSNESEffectMapping(p) {
  if (p.includes("waveform") || p.includes("wave") || p.includes("sample")) return absEffect(16, 255);
  if (p.includes("noise") || p.includes("noisemode")) return absEffect(17, 255);
  if (p.includes("echo") && !p.includes("delay") && !p.includes("feedback") && !p.includes("vol") && !p.includes("fir")) return absEffect(18, 1);
  if (p.includes("pitchmod") || p.includes("pitch_mod")) return absEffect(19, 1);
  if (p.includes("invert")) return absEffect(20, 1);
  if (p.includes("gainmode") || p.includes("gain_mode")) return absEffect(21, 255);
  if (p.includes("gain") && !p.includes("gainmode")) return absEffect(22, 255);
  if (p.includes("noisefreq") || p.includes("noise_freq")) return absEffect(29, 255);
  if (p.includes("attackrate") || p.includes(".ar")) return absEffect(32, 15);
  if (p.includes("decayrate") || p.includes(".dr")) return absEffect(33, 7);
  if (p.includes("sustainlevel") || p.includes(".sl")) return absEffect(34, 7);
  if (p.includes("releaserate") || p.includes(".rr")) return absEffect(35, 31);
  if (p.includes("echoenable") || p.includes("echo_enable")) return absEffect(24, 1);
  if (p.includes("echodelay") || p.includes("echo_delay")) return absEffect(25, 7);
  if (p.includes("echovoll") || p.includes("echo_vol_l") || p.includes("echo_left")) return absEffect(26, 255);
  if (p.includes("echovolr") || p.includes("echo_vol_r") || p.includes("echo_right")) return absEffect(27, 255);
  if (p.includes("echofeedback") || p.includes("echo_feedback")) return absEffect(28, 255);
  if (p.includes("globalvoll") || p.includes("global_vol_l") || p.includes("mastervoll")) return absEffect(30, 255);
  if (p.includes("globalvolr") || p.includes("global_vol_r") || p.includes("mastervolr")) return absEffect(31, 255);
  for (let i = 0; i < 8; i++) {
    if (p === `fir${i}` || p === `fir_${i}` || p === `echocoef${i}`) return absEffect(48 + i, 255);
  }
  return null;
}
function getAmigaEffectMapping(p) {
  if (p.includes("ledfilter") || p.includes("amigafilter") || p.includes("filter") && !p.includes("filtermode")) return absEffect(16, 1);
  if (p.includes("ampmod") || p.includes("am")) return absEffect(17, 255);
  if (p.includes("pitchmod") || p.includes("pm")) return absEffect(18, 255);
  return null;
}
function getSMSEffectMapping(p) {
  if (p.includes("noisemode") || p.includes("noise") || p.includes("duty")) return absEffect(32, 3);
  return null;
}
function getVRC6EffectMapping(p) {
  if (p.includes("duty") || p.includes("pulse")) return absEffect(18, 7);
  return null;
}
function getPOKEYEffectMapping(p) {
  if (p.includes("audctl") || p.includes("noisemode") || p.includes("noise")) return absEffect(32, 255);
  return null;
}
function getTIAEffectMapping(p) {
  if (p.includes("audc") || p.includes("noisemode") || p.includes("noise")) return absEffect(32, 255);
  return null;
}
function getN163EffectMapping(p) {
  if (p.includes("waveform") || p.includes("wave")) return absEffect(16, 255);
  if (p.includes("wavepos") || p.includes("wave_pos")) return absEffect(17, 255);
  if (p.includes("wavelen") || p.includes("wave_len")) return absEffect(18, 255);
  if (p.includes("channellimit") || p.includes("channel_limit")) return absEffect(24, 7);
  return null;
}
function getES5506EffectMapping(p) {
  if (p.includes("filtermode") || p.includes("filter_mode")) return absEffect(20, 255);
  if (p.includes("filterk1") || p.includes("filter_k1") || p.includes("cutoff")) return absEffect(21, 255);
  if (p.includes("filterk2") || p.includes("filter_k2") || p.includes("resonance")) return absEffect(22, 255);
  return null;
}
function getQSoundEffectMapping(p) {
  if (p.includes("echofeedback") || p.includes("echo_feedback")) return absEffect(23, 255);
  if (p.includes("echolevel") || p.includes("echo_level") || p.includes("echo")) return absEffect(24, 255);
  if (p.includes("surround")) return absEffect(25, 255);
  return null;
}
function getEffectMapping(param, format) {
  const p = param.toLowerCase();
  const chip = format.chipType;
  if (chip) {
    let mapping = null;
    if (chip === "c64") mapping = getC64EffectMapping(p);
    else if (chip === "ay" || chip === "saa") mapping = getAYEffectMapping(p);
    else if (["opn", "opn2", "opm", "arcade", "opl", "opl2", "opl3", "opll", "vrc7", "opz", "esfm"].includes(chip))
      mapping = getFMEffectMapping(p, chip);
    else if (chip === "gb") mapping = getGBEffectMapping(p);
    else if (chip === "nes") mapping = getNESEffectMapping(p);
    else if (chip === "fds") mapping = getFDSEffectMapping(p);
    else if (chip === "pce") mapping = getPCEEffectMapping(p);
    else if (chip === "snes") mapping = getSNESEffectMapping(p);
    else if (chip === "amiga") mapping = getAmigaEffectMapping(p);
    else if (chip === "sms" || chip === "sn76489") mapping = getSMSEffectMapping(p);
    else if (chip === "vrc6") mapping = getVRC6EffectMapping(p);
    else if (chip === "pokey") mapping = getPOKEYEffectMapping(p);
    else if (chip === "tia") mapping = getTIAEffectMapping(p);
    else if (chip === "n163") mapping = getN163EffectMapping(p);
    else if (chip === "es5506") mapping = getES5506EffectMapping(p);
    else if (chip === "qsound") mapping = getQSoundEffectMapping(p);
    if (mapping) return mapping;
  }
  if (p.includes("volume") || p.includes(".vol") || p === "gain" || p.includes("level") || p.includes("amplitude")) {
    return {
      write: (cell, v, prevValue, fmt) => {
        const vol = norm(v, 64);
        if (prevValue !== null && norm(prevValue, 64) === vol) return true;
        if (hasVolumeColumn(fmt)) {
          if (cell.volume === 0 || cell.volume === void 0) {
            cell.volume = 16 + Math.min(vol, 64);
            return true;
          }
        }
        return writeEffect(cell, 12, Math.min(vol, 64), fmt);
      }
    };
  }
  if (p.includes("globalvol") || p.includes("global_vol") || p.includes("master_vol") || p.includes("mastervol")) {
    if (format.name === "MOD") return null;
    return {
      write: (cell, v, prevValue, fmt) => {
        const maxVal = fmt.name === "IT" ? 128 : 64;
        const gvol = norm(v, maxVal);
        if (prevValue !== null && norm(prevValue, maxVal) === gvol) return true;
        if (!hasExtendedEffects(fmt)) return false;
        return writeEffect(cell, 16, gvol, fmt);
      }
    };
  }
  if (p.includes("pan")) {
    if (!format.supportsPanning) return null;
    return {
      write: (cell, v, prevValue, fmt) => {
        const pan = norm(v, 255);
        if (prevValue !== null && norm(prevValue, 255) === pan) return true;
        if (hasVolumeColumn(fmt) && writePanToVolumeColumn(cell, v)) {
          return true;
        }
        return writeEffect(cell, 8, pan, fmt);
      }
    };
  }
  if (p.includes("cutoff") || p.includes("filter") && !p.includes("filterselect") && !p.includes("filtermode")) {
    if (format.name !== "IT" && format.name !== "S3M") return null;
    return {
      write: (cell, v, prevValue, fmt) => {
        const cutoff = norm(v, 127);
        if (prevValue !== null && norm(prevValue, 127) === cutoff) return true;
        return writeEffect(cell, 26, cutoff, fmt);
      }
    };
  }
  if (p.includes("resonance") || p.includes("reso")) {
    if (format.name !== "IT" && format.name !== "S3M") return null;
    return {
      write: (cell, v, prevValue, fmt) => {
        const reso = norm(v, 15);
        if (prevValue !== null && norm(prevValue, 15) === reso) return true;
        return writeEffect(cell, 26, 128 + reso, fmt);
      }
    };
  }
  if (p.includes("pitch") || p.includes("frequency") || p.includes("period") || p.includes("detune") || p.includes("finetune")) {
    return {
      write: (cell, v, prevValue, fmt) => {
        if (prevValue === null) return true;
        const delta = v - prevValue;
        if (Math.abs(delta) < 2e-3) return true;
        const speed = Math.min(255, Math.round(Math.abs(delta) * 255));
        if (speed === 0) return true;
        if (delta > 0) {
          return writeEffect(cell, 1, speed, fmt);
        } else {
          return writeEffect(cell, 2, speed, fmt);
        }
      }
    };
  }
  if (p.includes("vibrato")) {
    return {
      write: (cell, v, _prevValue, fmt) => {
        const combined = norm(v, 255);
        const speed = combined >> 4 & 15;
        const depth = combined & 15;
        if (speed === 0 && depth === 0) return true;
        return writeEffect(cell, 4, speed << 4 | depth, fmt);
      }
    };
  }
  if (p.includes("tremolo")) {
    return {
      write: (cell, v, _prevValue, fmt) => {
        const combined = norm(v, 255);
        const speed = combined >> 4 & 15;
        const depth = combined & 15;
        if (speed === 0 && depth === 0) return true;
        return writeEffect(cell, 7, speed << 4 | depth, fmt);
      }
    };
  }
  if (p.includes("pulse") || p.includes("duty")) {
    return null;
  }
  return null;
}
function bakeAutomationForExport(patterns, curves, format) {
  const baked = structuredClone(patterns);
  const warnings = [];
  let bakedCount = 0;
  let overflowRows = 0;
  for (const curve of curves) {
    if (!curve.enabled || curve.points.length === 0) continue;
    const patIdx = baked.findIndex((p) => p.id === curve.patternId);
    if (patIdx < 0) continue;
    const pattern = baked[patIdx];
    const ch = curve.channelIndex;
    if (ch < 0 || ch >= pattern.channels.length) continue;
    const mapping = getEffectMapping(curve.parameter, format);
    if (!mapping) {
      warnings.push(`"${curve.parameter}" cannot be baked into ${format.name} effect commands`);
      continue;
    }
    let rowsWritten = 0;
    let prevValue = null;
    for (let row = 0; row < pattern.length; row++) {
      const cell = pattern.channels[ch].rows[row];
      if (!cell) continue;
      const value = interpolateAutomationValue(
        curve.points,
        row,
        curve.interpolation,
        curve.mode
      );
      if (value === null) continue;
      if (mapping.write(cell, value, prevValue, format)) {
        rowsWritten++;
      } else {
        overflowRows++;
      }
      prevValue = value;
    }
    if (rowsWritten > 0) {
      bakedCount++;
    } else {
      warnings.push(`"${curve.parameter}" curve has no data to bake`);
    }
  }
  const volColSlides = optimizeVolumeSlides(baked, format);
  const effColSlides = optimizeEffectColumnVolumeSlides(baked);
  const totalSlides = volColSlides + effColSlides;
  if (totalSlides > 0) {
    warnings.push(`Optimized ${totalSlides} volume row(s) into fine slide commands.`);
  }
  return { patterns: baked, bakedCount, overflowRows, warnings };
}
function optimizeSlides(patterns, strategy) {
  let optimized = 0;
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      const rows = channel.rows;
      let runStart = -1;
      let runDelta = 0;
      let runStartVal = 0;
      const finalize = (endRow) => {
        if (runStart >= 0 && endRow - runStart >= 1 && runDelta !== 0) {
          for (let r = runStart + 1; r <= endRow; r++) {
            if (rows[r]) strategy.writeSlide(rows[r], runDelta);
          }
          optimized += endRow - runStart;
        }
      };
      for (let r = 0; r <= rows.length; r++) {
        const cell = r < rows.length ? rows[r] : void 0;
        const eligible = cell && !cell.note && !cell.instrument;
        const value = eligible ? strategy.readValue(cell) : null;
        if (value === null) {
          finalize(r - 1);
          runStart = -1;
          runDelta = 0;
          continue;
        }
        if (runStart < 0) {
          runStart = r;
          runStartVal = value;
          runDelta = 0;
        } else if (runStart === r - 1) {
          runDelta = value - runStartVal;
          if (Math.abs(runDelta) < 1 || Math.abs(runDelta) > 15) {
            runStart = r;
            runStartVal = value;
            runDelta = 0;
          }
        } else {
          const expected = runStartVal + runDelta * (r - runStart);
          if (value !== expected) {
            finalize(r - 1);
            runStart = r;
            runStartVal = value;
            runDelta = 0;
          }
        }
      }
      finalize(rows.length - 1);
    }
  }
  return optimized;
}
const VOL_COLUMN_SLIDE = {
  readValue: (cell) => {
    const v = cell.volume;
    if (v === void 0 || v < 16 || v > 80) return null;
    return v - 16;
  },
  writeSlide: (cell, delta) => {
    cell.volume = delta > 0 ? 144 + delta : 128 + -delta;
  }
};
const EFFECT_COLUMN_SLIDE = {
  readValue: (cell) => {
    if (cell.effTyp !== 12 || cell.eff < 0 || cell.eff > 64) return null;
    return cell.eff;
  },
  writeSlide: (cell, delta) => {
    cell.effTyp = 14;
    cell.eff = delta > 0 ? 160 + delta : 176 + -delta;
  }
};
function optimizeVolumeSlides(patterns, format) {
  if (!hasVolumeColumn(format)) return 0;
  return optimizeSlides(patterns, VOL_COLUMN_SLIDE);
}
function optimizeEffectColumnVolumeSlides(patterns) {
  return optimizeSlides(patterns, EFFECT_COLUMN_SLIDE);
}
function getUnbakeableParameters(curves, format) {
  const unbakeable = [];
  for (const curve of curves) {
    if (!curve.enabled || curve.points.length === 0) continue;
    const mapping = getEffectMapping(curve.parameter, format);
    if (!mapping) {
      unbakeable.push(curve.parameter);
    }
  }
  return [...new Set(unbakeable)];
}
export {
  bakeAutomationForExport,
  getUnbakeableParameters
};

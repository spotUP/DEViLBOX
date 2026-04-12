import { bP as interpolateAutomationValue } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const curveBakeRecords = /* @__PURE__ */ new Map();
function forgetCurveBake(curveId) {
  curveBakeRecords.delete(curveId);
}
function forgetAllCurveBakes() {
  curveBakeRecords.clear();
}
function getSlotForCurve(parameter, format) {
  const p = parameter.toLowerCase();
  const isVolumeParam = p.includes("volume") || p.includes(".vol") || p === "gain";
  if (isVolumeParam) {
    const hasVolCol = format.name !== "MOD" && format.name !== "FC" && format.name !== "HVL" && format.name !== "AHX";
    return hasVolCol ? "volume" : "effect1";
  }
  return "effect1";
}
function encodeValue(parameter, value, format) {
  const p = parameter.toLowerCase();
  const v = Math.max(0, Math.min(1, value));
  if (p.includes("volume") || p.includes(".vol") || p === "gain") {
    const vol = Math.round(v * 64);
    const hasVolCol = format.name !== "MOD" && format.name !== "FC" && format.name !== "HVL" && format.name !== "AHX";
    if (hasVolCol) {
      return { volumeByte: 16 + Math.min(vol, 64) };
    }
    return { effTyp: 12, effParam: Math.min(vol, 64) };
  }
  if (p.includes("pan") && format.supportsPanning) {
    return { effTyp: 8, effParam: Math.round(v * 255) };
  }
  if ((p.includes("cutoff") || p.includes("filter") && !p.includes("filtermode")) && (format.name === "IT" || format.name === "S3M")) {
    return { effTyp: 26, effParam: Math.round(v * 127) };
  }
  if ((p.includes("resonance") || p.includes("reso")) && (format.name === "IT" || format.name === "S3M")) {
    return { effTyp: 26, effParam: 128 + Math.round(v * 15) };
  }
  return null;
}
function clearSlot(cell, slotKey) {
  switch (slotKey) {
    case "volume":
      cell.volume = 0;
      break;
    case "effect1":
      cell.effTyp = 0;
      cell.eff = 0;
      break;
    case "effect2":
      cell.effTyp2 = 0;
      cell.eff2 = 0;
      break;
  }
}
function writeSlot(cell, slotKey, ev) {
  switch (slotKey) {
    case "volume":
      if (ev.volumeByte !== void 0) cell.volume = ev.volumeByte;
      break;
    case "effect1":
      if (ev.effTyp !== void 0 && ev.effParam !== void 0) {
        cell.effTyp = ev.effTyp;
        cell.eff = ev.effParam;
      }
      break;
    case "effect2":
      if (ev.effTyp !== void 0 && ev.effParam !== void 0) {
        cell.effTyp2 = ev.effTyp;
        cell.eff2 = ev.effParam;
      }
      break;
  }
}
function syncCurveToCells(curve, pattern, format) {
  const ch = curve.channelIndex;
  if (ch < 0 || ch >= pattern.channels.length) {
    return { changed: false, rowsWritten: 0 };
  }
  const channel = pattern.channels[ch];
  const slotKey = getSlotForCurve(curve.parameter, format);
  const testEncoding = encodeValue(curve.parameter, 0.5, format);
  if (!testEncoding) {
    const prior2 = curveBakeRecords.get(curve.id);
    if (prior2) {
      for (const row of prior2.rowsWritten) {
        const cell = channel.rows[row];
        if (cell) clearSlot(cell, prior2.slotKey);
      }
      curveBakeRecords.delete(curve.id);
      return { changed: true, rowsWritten: 0 };
    }
    return { changed: false, rowsWritten: 0 };
  }
  const prior = curveBakeRecords.get(curve.id);
  if (prior) {
    for (const row of prior.rowsWritten) {
      const cell = channel.rows[row];
      if (cell) clearSlot(cell, prior.slotKey);
    }
  }
  if (!curve.enabled || curve.points.length === 0) {
    curveBakeRecords.delete(curve.id);
    return { changed: !!prior, rowsWritten: 0 };
  }
  const newRowsWritten = [];
  for (let row = 0; row < pattern.length; row++) {
    const cell = channel.rows[row];
    if (!cell) continue;
    const value = interpolateAutomationValue(
      curve.points,
      row,
      curve.interpolation,
      curve.mode
    );
    if (value === null) continue;
    const encoded = encodeValue(curve.parameter, value, format);
    if (!encoded) continue;
    writeSlot(cell, slotKey, encoded);
    newRowsWritten.push(row);
  }
  curveBakeRecords.set(curve.id, { slotKey, rowsWritten: newRowsWritten });
  return { changed: true, rowsWritten: newRowsWritten.length };
}
export {
  forgetAllCurveBakes,
  forgetCurveBake,
  syncCurveToCells
};

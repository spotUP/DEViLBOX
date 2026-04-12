import { a as amigaPeriodToNote } from "./amigaPeriodToNote-Dr2cuqKk.js";
import { c8 as idGenerator } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function emptyCell() {
  return {
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0
  };
}
function midiToXmNote(midiNote) {
  const xm = midiNote + 1;
  return Math.max(1, Math.min(96, xm));
}
function detectSpeed(snapshots, channelCount) {
  const intervalCounts = /* @__PURE__ */ new Map();
  for (let ch = 0; ch < channelCount; ch++) {
    let lastTriggerTick = -1;
    for (const snap of snapshots) {
      if (ch >= snap.channels.length) continue;
      const state = snap.channels[ch];
      if (state.triggered === 1) {
        if (lastTriggerTick >= 0) {
          const interval = snap.tick - lastTriggerTick;
          if (interval >= 1 && interval <= 200) {
            intervalCounts.set(interval, (intervalCounts.get(interval) ?? 0) + 1);
          }
        }
        lastTriggerTick = snap.tick;
      }
    }
  }
  if (intervalCounts.size === 0) return 6;
  let bestInterval = 6;
  let bestCount = 0;
  for (const [interval, count] of intervalCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestInterval = interval;
    }
  }
  return bestInterval;
}
function detectEffect(rowSnapshots, ch) {
  if (rowSnapshots.length < 2) return { effTyp: 0, eff: 0 };
  const states = rowSnapshots.filter((s) => ch < s.channels.length).map((s) => s.channels[ch]);
  if (states.length < 2) return { effTyp: 0, eff: 0 };
  const uniquePeriods = new Set(states.filter((s) => s.period > 0).map((s) => s.period));
  if (uniquePeriods.size >= 2 && uniquePeriods.size <= 3) {
    const sorted = [...uniquePeriods].sort((a, b) => b - a);
    const basePeriod = sorted[0];
    let isArpeggio = true;
    for (const s of states) {
      if (s.period > 0 && !uniquePeriods.has(s.period)) {
        isArpeggio = false;
        break;
      }
    }
    if (isArpeggio && basePeriod > 0) {
      const semitonesArr = sorted.slice(1).map(
        (p) => Math.round(12 * Math.log2(basePeriod / p))
      );
      const x = Math.min(15, Math.max(0, semitonesArr[0] ?? 0));
      const y = Math.min(15, Math.max(0, semitonesArr[1] ?? 0));
      if (x > 0 || y > 0) {
        return { effTyp: 0, eff: x << 4 | y };
      }
    }
  }
  const periodDeltas = [];
  for (let i = 1; i < states.length; i++) {
    if (states[i].period > 0 && states[i - 1].period > 0) {
      periodDeltas.push(states[i].period - states[i - 1].period);
    }
  }
  if (periodDeltas.length >= 2) {
    const firstDelta = periodDeltas[0];
    const isConstant = periodDeltas.every((d) => d === firstDelta);
    if (isConstant && firstDelta !== 0) {
      const absSpeed = Math.min(255, Math.abs(firstDelta));
      if (firstDelta < 0) {
        return { effTyp: 1, eff: absSpeed };
      } else {
        return { effTyp: 2, eff: absSpeed };
      }
    }
  }
  if (periodDeltas.length >= 3) {
    let signChanges = 0;
    for (let i = 1; i < periodDeltas.length; i++) {
      if (periodDeltas[i] > 0 && periodDeltas[i - 1] < 0 || periodDeltas[i] < 0 && periodDeltas[i - 1] > 0) {
        signChanges++;
      }
    }
    if (signChanges >= 2) {
      const maxDelta = Math.max(...periodDeltas.map(Math.abs));
      const depth = Math.min(15, Math.round(maxDelta / 2));
      const speed = Math.min(15, Math.max(1, Math.round(signChanges * 2)));
      if (depth > 0) {
        return { effTyp: 4, eff: speed << 4 | depth };
      }
    }
  }
  const volDeltas = [];
  for (let i = 1; i < states.length; i++) {
    volDeltas.push(states[i].volume - states[i - 1].volume);
  }
  if (volDeltas.length >= 2) {
    const firstDelta = volDeltas[0];
    const isConstant = volDeltas.every((d) => d === firstDelta);
    if (isConstant && firstDelta !== 0) {
      const absSpeed = Math.min(15, Math.abs(firstDelta));
      const eff = firstDelta > 0 ? absSpeed << 4 : absSpeed & 15;
      return { effTyp: 10, eff };
    }
  }
  if (volDeltas.length >= 3) {
    let volSignChanges = 0;
    for (let i = 1; i < volDeltas.length; i++) {
      if (volDeltas[i] > 0 && volDeltas[i - 1] < 0 || volDeltas[i] < 0 && volDeltas[i - 1] > 0) {
        volSignChanges++;
      }
    }
    if (volSignChanges >= 2) {
      const maxVolDelta = Math.max(...volDeltas.map(Math.abs));
      const depth = Math.min(15, Math.max(1, Math.round(maxVolDelta)));
      const tSpeed = Math.min(15, Math.max(1, Math.round(volSignChanges * 2)));
      if (depth > 0) {
        return { effTyp: 7, eff: tSpeed << 4 | depth };
      }
    }
  }
  if (periodDeltas.length >= 3) {
    const allSameSign = periodDeltas.every((d) => d > 0) || periodDeltas.every((d) => d < 0);
    if (allSameSign) {
      const absDeltaFirst = Math.abs(periodDeltas[0]);
      const absDeltaLast = Math.abs(periodDeltas[periodDeltas.length - 1]);
      if (absDeltaFirst > absDeltaLast && absDeltaFirst > 0) {
        const portaSpeed = Math.min(255, Math.round(
          periodDeltas.reduce((s, d) => s + Math.abs(d), 0) / periodDeltas.length
        ));
        if (portaSpeed > 0) {
          return { effTyp: 3, eff: portaSpeed };
        }
      }
    }
  }
  const triggerTicks = [];
  for (let i = 0; i < rowSnapshots.length; i++) {
    if (ch < rowSnapshots[i].channels.length && rowSnapshots[i].channels[ch].triggered === 1) {
      triggerTicks.push(i);
    }
  }
  if (triggerTicks.length >= 2) {
    const intervals = [];
    for (let i = 1; i < triggerTicks.length; i++) {
      intervals.push(triggerTicks[i] - triggerTicks[i - 1]);
    }
    const firstInterval = intervals[0];
    if (firstInterval > 0 && firstInterval <= 15 && intervals.every((d) => d === firstInterval)) {
      return { effTyp: 14, eff: 144 | firstInterval };
    }
  }
  return { effTyp: 0, eff: 0 };
}
function reconstructPatterns(snapshots, samplePtrToInstrIndex, channelCount = 4, speedHint, scanDurationMs) {
  const warnings = [];
  if (snapshots.length < 2) {
    warnings.push("Too few CIA tick snapshots to reconstruct patterns (need ≥ 2)");
    return { patterns: [], bpm: 125, speed: 6, firstTick: 0, warnings };
  }
  const speed = speedHint ?? detectSpeed(snapshots, channelCount);
  const firstTick = snapshots[0].tick;
  const tickToSnap = /* @__PURE__ */ new Map();
  for (const snap of snapshots) {
    if (!tickToSnap.has(snap.tick)) {
      tickToSnap.set(snap.tick, snap);
    }
  }
  const lastTick = snapshots[snapshots.length - 1].tick;
  const totalRows = Math.ceil((lastTick - firstTick + 1) / speed);
  if (totalRows === 0) {
    warnings.push("All tick snapshots have the same tick value — cannot reconstruct rows");
    return { patterns: [], bpm: 125, speed, firstTick, warnings };
  }
  const PATTERN_LENGTH = 64;
  const channelRowArrays = Array.from(
    { length: channelCount },
    () => []
  );
  const prevPeriod = new Array(channelCount).fill(0);
  const prevLc = new Array(channelCount).fill(0);
  const prevPlaying = new Array(channelCount).fill(false);
  for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
    const rowStartTick = firstTick + rowIdx * speed;
    const rowSnaps = [];
    for (const snap of snapshots) {
      const offset = snap.tick - rowStartTick;
      if (offset >= 0 && offset < speed) {
        rowSnaps.push(snap);
      }
    }
    const firstSnap = rowSnaps[0] ?? tickToSnap.get(rowStartTick);
    for (let ch = 0; ch < channelCount; ch++) {
      const cell = emptyCell();
      if (firstSnap && ch < firstSnap.channels.length) {
        const state = firstSnap.channels[ch];
        const hasTriggered = state.triggered === 1;
        const hasDma = state.dmaEn !== 0 && state.period > 0;
        if (hasDma) {
          const currInstr = samplePtrToInstrIndex.get(state.lc) ?? 0;
          const prevInstr = samplePtrToInstrIndex.get(prevLc[ch]) ?? 0;
          const sameInstrument = currInstr !== 0 && currInstr === prevInstr;
          const isHeldLegacy = state.period === prevPeriod[ch] && (state.lc === prevLc[ch] || sameInstrument);
          const isNewNote = hasTriggered || !isHeldLegacy;
          if (isNewNote) {
            const noteInfo = amigaPeriodToNote(state.period);
            if (noteInfo !== null) {
              cell.note = midiToXmNote(noteInfo.note);
            }
            const instrIdx = samplePtrToInstrIndex.get(state.lc);
            if (instrIdx !== void 0) {
              cell.instrument = instrIdx;
            }
            if (state.volume >= 0 && state.volume < 64) {
              cell.volume = 16 + Math.min(64, state.volume);
            } else if (state.volume === 64) {
              cell.volume = 0;
            }
          }
          prevPeriod[ch] = state.period;
          prevLc[ch] = state.lc;
          prevPlaying[ch] = true;
        } else {
          if (prevPlaying[ch]) {
            cell.note = 97;
          }
          prevPeriod[ch] = 0;
          prevLc[ch] = 0;
          prevPlaying[ch] = false;
        }
        if (cell.note !== 0 || cell.instrument !== 0) {
          const { effTyp, eff } = detectEffect(rowSnaps, ch);
          cell.effTyp = effTyp;
          cell.eff = eff;
        }
      }
      channelRowArrays[ch].push(cell);
    }
  }
  const patterns = [];
  const numPatterns = Math.ceil(totalRows / PATTERN_LENGTH);
  for (let patIdx = 0; patIdx < numPatterns; patIdx++) {
    const startRow = patIdx * PATTERN_LENGTH;
    const endRow = Math.min(startRow + PATTERN_LENGTH, totalRows);
    const patLen = endRow - startRow;
    const AMIGA_PAN = [-50, 50, 50, -50];
    const channels = channelRowArrays.map((allRows, ch) => ({
      id: idGenerator.generate("uade-ch"),
      name: `Channel ${ch + 1}`,
      rows: allRows.slice(startRow, endRow),
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: AMIGA_PAN[ch] ?? 0,
      instrumentId: null,
      color: null,
      channelMeta: {
        importedFromMOD: true,
        originalIndex: ch,
        channelType: "sample"
      }
    }));
    patterns.push({
      id: idGenerator.generate("uade-pat"),
      name: `Pattern ${patIdx + 1}`,
      length: patLen,
      channels
    });
  }
  if (patterns.length > 256) {
    warnings.push(
      `Reconstructed ${patterns.length} patterns from ${totalRows} rows (speed=${speed}) — this may indicate noisy snapshot data`
    );
  }
  let bpm = 125;
  if (scanDurationMs && scanDurationMs > 0) {
    const tickSpan = lastTick - firstTick;
    if (tickSpan > 0) {
      const tickRate = tickSpan / (scanDurationMs / 1e3);
      const estimatedBpm = Math.round(tickRate * 2.5);
      if (estimatedBpm >= 40 && estimatedBpm <= 400) {
        bpm = estimatedBpm;
      } else {
        warnings.push(`Estimated BPM ${estimatedBpm} out of range (40-400), using default 125`);
      }
    }
  }
  return { patterns, bpm, speed, firstTick, warnings };
}
export {
  reconstructPatterns
};

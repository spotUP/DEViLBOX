/**
 * GTTableCodec — Encode/decode GoatTracker Ultra table sequences
 * for the visual Sound Designer editor.
 *
 * GoatTracker uses 4 global lookup tables (wave/pulse/filter/speed)
 * with left/right columns (255 entries each). Each instrument has
 * pointers into these tables. The codec converts between raw hex
 * table data and human-readable step arrays.
 *
 * Reference: gplay.c (playroutine), gcommon.h (constants)
 *
 * Table encoding constants (from gcommon.h):
 *   WAVELASTDELAY  = 0x0F  (left 0x01-0x0F = delay 1-15 frames)
 *   WAVESILENT     = 0xE0  (left 0xE0-0xEF = inaudible waveform)
 *   WAVELASTSILENT = 0xEF
 *   WAVECMD        = 0xF0  (left 0xF0-0xFE = embedded commands)
 *   WAVELASTCMD    = 0xFE
 *   0xFF           = end/jump marker (right = jump target, 0 = stop)
 */

// ── Wave Table ──────────────────────────────────────────────────────────────

export interface WaveStep {
  /** SID waveform bits: 0x10=TRI, 0x20=SAW, 0x40=PUL, 0x80=NOI (can be combined) */
  waveform: number;
  /** Gate bit on */
  gate: boolean;
  /** Sync bit (bit 1) */
  sync: boolean;
  /** Ring modulation bit (bit 2) */
  ring: boolean;
  /** Delay in frames (1-15, 0 = no delay before this step) */
  delay: number;
  /** Right column: note value. 0x80 = no note change, <0x80 = relative, >=0x80 raw */
  noteOffset: number;
  /** True if this is an advanced command (F0-FE) rather than a waveform */
  isCommand?: boolean;
  /** Raw left byte for commands */
  cmdByte?: number;
  /** Raw right byte for commands */
  cmdParam?: number;
}

/**
 * Decode a wave table sequence starting at a given pointer.
 * Walks through until 0xFF (end/jump) or 255 entries.
 */
export function decodeWaveSequence(
  left: Uint8Array,
  right: Uint8Array,
  startPtr: number,
): WaveStep[] {
  const steps: WaveStep[] = [];
  if (startPtr <= 0 || startPtr > 254) return steps;

  let pendingDelay = 0;
  let i = startPtr - 1; // GoatTracker uses 1-based pointers

  for (let safety = 0; safety < 255 && i < 255; safety++) {
    const l = left[i];
    const r = right[i];

    // End/jump marker
    if (l === 0xFF) break;

    // Delay (0x01-0x0F)
    if (l >= 0x01 && l <= 0x0F) {
      pendingDelay += l;
      i++;
      continue;
    }

    // Waveform value (0x10-0xDF) or silent (0xE0-0xEF)
    if (l >= 0x10 && l <= 0xEF) {
      const isSilent = l >= 0xE0;
      const waveBits = isSilent ? 0 : (l & 0xF0);
      steps.push({
        waveform: waveBits,
        gate: !!(l & 0x01),
        sync: !!(l & 0x02),
        ring: !!(l & 0x04),
        delay: pendingDelay,
        noteOffset: r,
      });
      pendingDelay = 0;
      i++;
      continue;
    }

    // Command (0xF0-0xFE)
    if (l >= 0xF0 && l <= 0xFE) {
      steps.push({
        waveform: 0,
        gate: false,
        sync: false,
        ring: false,
        delay: pendingDelay,
        noteOffset: 0,
        isCommand: true,
        cmdByte: l,
        cmdParam: r,
      });
      pendingDelay = 0;
      i++;
      continue;
    }

    // Shouldn't reach here (0x00 is unused)
    i++;
  }

  return steps;
}

/**
 * Encode a wave step sequence back to left/right table bytes.
 * Returns arrays to write starting at the instrument's wavePtr.
 */
export function encodeWaveSequence(steps: WaveStep[]): { left: number[]; right: number[] } {
  const left: number[] = [];
  const right: number[] = [];

  for (const step of steps) {
    // Write delay first if > 0
    if (step.delay > 0) {
      // Split delays > 15 into multiple entries
      let remaining = step.delay;
      while (remaining > 0) {
        const d = Math.min(15, remaining);
        left.push(d);
        right.push(0);
        remaining -= d;
      }
    }

    if (step.isCommand) {
      left.push(step.cmdByte ?? 0xF0);
      right.push(step.cmdParam ?? 0);
    } else {
      // Waveform byte: waveform bits | gate | sync | ring
      let wave = step.waveform & 0xF0;
      if (step.gate) wave |= 0x01;
      if (step.sync) wave |= 0x02;
      if (step.ring) wave |= 0x04;
      // Ensure we're in the valid waveform range (0x10-0xDF)
      if (wave < 0x10) wave = 0x10;
      left.push(wave);
      right.push(step.noteOffset);
    }
  }

  // End marker
  left.push(0xFF);
  right.push(0x00);

  return { left, right };
}

// ── Pulse Table ─────────────────────────────────────────────────────────────

export interface PulseStep {
  /** 'set' = absolute pulse width, 'mod' = modulation speed */
  type: 'set' | 'mod';
  /** For 'set': 12-bit pulse width (0-4095). For 'mod': duration in frames */
  value: number;
  /** For 'mod': speed byte (0x00-0x7F = up, 0x80-0xFF = down) */
  speed: number;
}

/**
 * Decode pulse table from pointer. Format:
 * - left >= 0x80: set pulse width = ((left & 0x0F) << 8) | right (12-bit)
 * - left 0x01-0x7F: modulation duration (frames), right = speed
 * - left 0xFF: end/jump
 */
export function decodePulseSequence(
  left: Uint8Array,
  right: Uint8Array,
  startPtr: number,
): PulseStep[] {
  const steps: PulseStep[] = [];
  if (startPtr <= 0 || startPtr > 254) return steps;

  let i = startPtr - 1;

  for (let safety = 0; safety < 255 && i < 255; safety++) {
    const l = left[i];
    const r = right[i];

    if (l === 0xFF) break;

    if (l >= 0x80) {
      // Absolute pulse width set
      const pw = ((l & 0x0F) << 8) | r;
      steps.push({ type: 'set', value: pw, speed: 0 });
    } else if (l > 0) {
      // Modulation: l = duration, r = speed
      steps.push({ type: 'mod', value: l, speed: r });
    }

    i++;
  }

  return steps;
}

/**
 * Encode pulse steps to table bytes.
 */
export function encodePulseSequence(steps: PulseStep[]): { left: number[]; right: number[] } {
  const left: number[] = [];
  const right: number[] = [];

  for (const step of steps) {
    if (step.type === 'set') {
      const pw = Math.max(0, Math.min(4095, step.value));
      left.push(0x80 | ((pw >> 8) & 0x0F));
      right.push(pw & 0xFF);
    } else {
      left.push(Math.max(1, Math.min(127, step.value)));
      right.push(step.speed & 0xFF);
    }
  }

  left.push(0xFF);
  right.push(0x00);

  return { left, right };
}

/**
 * Convert a simple pulse width envelope (array of 12-bit values)
 * into pulse table steps. Uses 'set' for the first value and
 * 'mod' entries to sweep between subsequent values.
 */
export function pulseEnvelopeToSteps(values: number[], framesPerStep: number = 1): PulseStep[] {
  if (values.length === 0) return [];
  const steps: PulseStep[] = [{ type: 'set', value: values[0], speed: 0 }];

  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff === 0) continue;
    // Approximate with modulation speed
    const speed = Math.round(diff / framesPerStep);
    if (speed > 0 && speed < 128) {
      steps.push({ type: 'mod', value: framesPerStep, speed });
    } else if (speed < 0 && speed > -128) {
      steps.push({ type: 'mod', value: framesPerStep, speed: (256 + speed) & 0xFF });
    } else {
      // Large jump — use absolute set
      steps.push({ type: 'set', value: values[i], speed: 0 });
    }
  }

  return steps;
}

// ── Filter Table ────────────────────────────────────────────────────────────

export interface FilterStep {
  /** 'set' = set cutoff/params, 'mod' = modulate cutoff */
  type: 'set' | 'mod';
  /** For 'set': filter params (mode, resonance, routing) from left byte.
   *  For 'mod': duration in frames */
  value: number;
  /** Right column value (cutoff for set, speed for mod) */
  param: number;
}

/**
 * Decode filter table from pointer. Filter table format:
 * - left 0x00: passthrough (right = filter type/control nybbles)
 * - left >= 0x80: set filter params (mode/resonance/routing in left, cutoff in right)
 * - left 0x01-0x7F: modulation duration, right = speed
 * - left 0xFF: end/jump
 */
export function decodeFilterSequence(
  left: Uint8Array,
  right: Uint8Array,
  startPtr: number,
): FilterStep[] {
  const steps: FilterStep[] = [];
  if (startPtr <= 0 || startPtr > 254) return steps;

  let i = startPtr - 1;

  for (let safety = 0; safety < 255 && i < 255; safety++) {
    const l = left[i];
    const r = right[i];

    if (l === 0xFF) break;

    if (l >= 0x80 || l === 0x00) {
      steps.push({ type: 'set', value: l, param: r });
    } else {
      steps.push({ type: 'mod', value: l, param: r });
    }

    i++;
  }

  return steps;
}

/**
 * Encode filter steps to table bytes.
 */
export function encodeFilterSequence(steps: FilterStep[]): { left: number[]; right: number[] } {
  const left: number[] = [];
  const right: number[] = [];

  for (const step of steps) {
    left.push(step.value & 0xFF);
    right.push(step.param & 0xFF);
  }

  left.push(0xFF);
  right.push(0x00);

  return { left, right };
}

// ── Speed Table ─────────────────────────────────────────────────────────────

/**
 * Speed table entries are used for portamento speeds and arpeggio patterns.
 * Each entry is a 16-bit value: (left << 8) | right.
 * For portamento: the value is the frequency delta per tick.
 * For arpeggio: patterns are stored as note offsets.
 *
 * The speed table is simpler than the others — no sequential execution,
 * just lookup by index. We decode it as an array of {left, right} pairs.
 */
export interface SpeedEntry {
  left: number;
  right: number;
}

export function decodeSpeedTable(
  left: Uint8Array,
  right: Uint8Array,
  startPtr: number,
  length: number = 16,
): SpeedEntry[] {
  const entries: SpeedEntry[] = [];
  if (startPtr <= 0 || startPtr > 254) return entries;

  const start = startPtr - 1;
  for (let i = 0; i < length && (start + i) < 255; i++) {
    const idx = start + i;
    if (left[idx] === 0xFF) break;
    entries.push({ left: left[idx], right: right[idx] });
  }

  return entries;
}

export function encodeSpeedTable(entries: SpeedEntry[]): { left: number[]; right: number[] } {
  return {
    left: entries.map(e => e.left & 0xFF),
    right: entries.map(e => e.right & 0xFF),
  };
}

// ── Wave table command labels ───────────────────────────────────────────────

const WAVE_CMD_NAMES: Record<number, string> = {
  0xF0: 'NOP',
  0xF1: 'Porta Up',
  0xF2: 'Porta Down',
  0xF3: 'Tone Porta',
  0xF4: 'Vibrato',
  0xF5: 'Set AD',
  0xF6: 'Set SR',
  0xF7: 'Set Wave',
  0xF9: 'Pulse Ptr',
  0xFA: 'Filter Ptr',
  0xFB: 'Filter Ctrl',
  0xFC: 'Cutoff',
  0xFD: 'Master Vol',
};

/** Get human-readable label for a wave table command byte */
export function waveCommandLabel(cmdByte: number): string {
  return WAVE_CMD_NAMES[cmdByte] ?? `CMD $${cmdByte.toString(16).toUpperCase()}`;
}

/** Get waveform name from waveform bits */
export function waveformName(bits: number): string {
  const parts: string[] = [];
  if (bits & 0x10) parts.push('TRI');
  if (bits & 0x20) parts.push('SAW');
  if (bits & 0x40) parts.push('PUL');
  if (bits & 0x80) parts.push('NOI');
  return parts.join('+') || 'OFF';
}

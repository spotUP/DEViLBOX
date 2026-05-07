/**
 * KKLightGuide — drives the key-LED Light Guide on Komplete Kontrol keyboards.
 *
 * The Light Guide is controlled via MIDI note-on messages sent to the
 * keyboard's REGULAR MIDI port ("Komplete Kontrol - 1"), NOT the DAW port.
 *
 * Protocol (from reaKontrol / DrivenByMoss analysis):
 *   - Channel: 1 (0-indexed channel 0)
 *   - Note 0–127: physical key
 *   - Velocity: color code (see LGColor enum)
 *
 * All 128 keys are colored each refresh. To clear a key: send note-on
 * with velocity 0 (effectively a note-off to the light guide).
 */

// ── Color palette ─────────────────────────────────────────────────────────────

export const LGColor = {
  Off:          0 as number,
  DarkBlue:     1 as number,
  Blue:         2 as number,
  Cyan:         3 as number,
  Green:        4 as number,
  YellowGreen:  5 as number,
  Yellow:       6 as number,
  Orange:       7 as number,
  Red:          8 as number,
  Pink:         9 as number,
  Magenta:      10 as number,
  Purple:       11 as number,
  White:        12 as number,
  LightBlue:    13 as number,
  LightGreen:   14 as number,
  LightOrange:  15 as number,
};

export type LGColor = number;

// ── Scale definitions (pitch classes, 0=C) ───────────────────────────────────

const SCALE_INTERVALS: Record<string, number[]> = {
  major:           [0, 2, 4, 5, 7, 9, 11],
  minor:           [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor:   [0, 2, 3, 5, 7, 8, 11],
  melodicMinor:    [0, 2, 3, 5, 7, 9, 11],
  dorian:          [0, 2, 3, 5, 7, 9, 10],
  phrygian:        [0, 1, 3, 5, 7, 8, 10],
  lydian:          [0, 2, 4, 6, 7, 9, 11],
  mixolydian:      [0, 2, 4, 5, 7, 9, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues:           [0, 3, 5, 6, 7, 10],
  chromatic:       [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const SCALE_NAMES = Object.keys(SCALE_INTERVALS);

// ── Mode ─────────────────────────────────────────────────────────────────────

export type LGMode = 'off' | 'scale' | 'chord' | 'playing';

export interface LGConfig {
  mode: LGMode;
  root: number;        // pitch class 0–11 (0=C)
  scale: string;       // key in SCALE_INTERVALS
  scaleColor: LGColor;
  rootColor: LGColor;
  playingColor: LGColor;
  chordNotes: number[]; // MIDI notes (0–127) in current chord
}

export const DEFAULT_LG_CONFIG: LGConfig = {
  mode: 'scale',
  root: 0,
  scale: 'major',
  scaleColor: LGColor.Green,
  rootColor: LGColor.Blue,
  playingColor: LGColor.White,
  chordNotes: [],
};

// ── Port detection ────────────────────────────────────────────────────────────

const KK_LIGHT_GUIDE_SUFFIXES = [
  'Komplete Kontrol - 1',
  'Komplete Kontrol A MIDI',
  'Komplete Kontrol M MIDI',
  'KONTROL S49 MK3',
  'KONTROL S61 MK3',
  'KONTROL S88 MK3',
];

export function isKKLightGuidePort(name: string): boolean {
  return KK_LIGHT_GUIDE_SUFFIXES.some(s => name.includes(s));
}

// ── KKLightGuide class ───────────────────────────────────────────────────────

export class KKLightGuide {
  private output: MIDIOutput | null = null;
  private config: LGConfig = { ...DEFAULT_LG_CONFIG };

  // Currently lit notes (note → color). Stored so we can diff updates.
  private currentColors: number[] = new Array(128).fill(0);

  // Active playing notes (set from outside)
  private playingNotes = new Set<number>();

  // ── Connection ───────────────────────────────────────────────────────────────

  connect(access: MIDIAccess): boolean {
    this.output = null;
    for (const output of access.outputs.values()) {
      if (isKKLightGuidePort(output.name ?? '')) {
        this.output = output;
        break;
      }
    }
    if (this.output) {
      console.log(`[KKLightGuide] Connected to "${this.output.name}"`);
      this.flush();
    }
    return !!this.output;
  }

  disconnect(): void {
    if (this.output) {
      this.clearAll();
      this.output = null;
    }
  }

  get connected(): boolean { return !!this.output; }

  // ── Config ───────────────────────────────────────────────────────────────────

  setConfig(config: Partial<LGConfig>): void {
    this.config = { ...this.config, ...config };
    this.flush();
  }

  setPlayingNotes(notes: number[]): void {
    this.playingNotes = new Set(notes);
    if (this.config.mode === 'playing' || this.config.mode === 'scale') {
      this.flush();
    }
  }

  addPlayingNote(note: number): void {
    this.playingNotes.add(note);
    if (this.output && (this.config.mode === 'playing' || this.config.mode === 'scale')) {
      const color = this.colorForNote(note);
      this.sendNote(note, color);
      this.currentColors[note] = color;
    }
  }

  removePlayingNote(note: number): void {
    this.playingNotes.delete(note);
    if (this.output && (this.config.mode === 'playing' || this.config.mode === 'scale')) {
      // Restore background color for this note
      const bgColor = this.backgroundColorForNote(note);
      this.sendNote(note, bgColor);
      this.currentColors[note] = bgColor;
    }
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  /** Compute and send the full 128-key state. Diffs against current to minimize messages. */
  flush(): void {
    if (!this.output) return;
    const next = this.computeColors();
    for (let n = 0; n < 128; n++) {
      if (next[n] !== this.currentColors[n]) {
        this.sendNote(n, next[n]);
        this.currentColors[n] = next[n];
      }
    }
  }

  private computeColors(): number[] {
    const out: number[] = new Array(128).fill(LGColor.Off);

    if (this.config.mode === 'off') return out;

    const { root, scale, scaleColor, rootColor, playingColor, chordNotes } = this.config;
    const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
    const scaleSet = new Set(intervals.map(i => (root + i) % 12));

    for (let n = 0; n < 128; n++) {
      const pc = n % 12;
      let color = LGColor.Off;

      if (this.config.mode === 'scale') {
        if (scaleSet.has(pc)) {
          color = pc === root ? rootColor : scaleColor;
        }
        // Playing notes override with playingColor
        if (this.playingNotes.has(n)) color = playingColor;
      } else if (this.config.mode === 'chord') {
        if (chordNotes.includes(n)) {
          color = playingColor;
        } else if (scaleSet.has(pc)) {
          color = pc === root ? rootColor : scaleColor;
        }
        if (this.playingNotes.has(n)) color = playingColor;
      } else if (this.config.mode === 'playing') {
        if (this.playingNotes.has(n)) color = playingColor;
      }

      out[n] = color;
    }

    return out;
  }

  private backgroundColorForNote(note: number): LGColor {
    if (this.config.mode === 'off') return LGColor.Off;
    const { root, scale, scaleColor, rootColor, chordNotes } = this.config;
    const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.major;
    const scaleSet = new Set(intervals.map(i => (root + i) % 12));
    const pc = note % 12;

    if (this.config.mode === 'playing') return LGColor.Off;
    if (chordNotes.includes(note)) return this.config.playingColor;
    if (scaleSet.has(pc)) return pc === root ? rootColor : scaleColor;
    return LGColor.Off;
  }

  private colorForNote(_note: number): LGColor {
    return this.config.playingColor;
  }

  private clearAll(): void {
    if (!this.output) return;
    for (let n = 0; n < 128; n++) {
      if (this.currentColors[n] !== 0) {
        this.sendNote(n, LGColor.Off);
      }
    }
    this.currentColors.fill(0);
  }

  private sendNote(note: number, color: LGColor): void {
    // Note-on, channel 1 (0xF0 & 0x90 = 0x90)
    this.output?.send(new Uint8Array([0x90, note & 0x7F, color & 0x7F]));
  }
}

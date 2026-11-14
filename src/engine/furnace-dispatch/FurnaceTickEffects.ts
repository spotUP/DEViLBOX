/**
 * Per-tick stepping of Furnace cell effects on chip channels of a tracker-made (hybrid) song.
 *
 * Furnace performs these effects tick by tick in playback.cpp (nextTick); the router's HINT_*
 * commands are only annotations a chip dispatch ignores. This module holds the per-channel
 * effect state and returns the dispatch commands a tick sends, ported from upstream:
 *
 *   arpeggio (0xy)  playback.cpp:2519-2541 (stepping), 1223-1231 (effect), 2506-2511 (reset)
 *     every tick: if arp != 0 and --arpTicks < 1: arpTicks = arpLen; stage = (stage + 1) % 3;
 *     send DIV_CMD_LEGATO with note, note + x, note + y for stage 0, 1, 2.
 *     The tick that starts a row steps too (the loop runs on every tick, no firstTick gate).
 *     Defaults match a new Furnace song: arpLen 1, compatibleArpeggio off, rowResetsArpPos off,
 *     arp0Reset on (ending an arpeggio sends LEGATO with the base note).
 *
 * The other per-tick effects use the same shape (per-channel state, beginRow reads the cell, tick
 * returns commands), in the order nextTick runs them (playback.cpp:2203-2300 volume slide and
 * tremolo, 2346-2400 vibrato, 2430-2455 portamento and slides, then the arpeggio):
 *   Axy volume slide   volSpeed = -(y*64) or x*64 (8.8 fixed point); VOLUME each tick, clamped 0..volMax
 *   7xy tremolo        VOLUME(volume - tremTable[pos] * depth), pos += rate (not while a slide runs)
 *   4xy vibrato        PITCH(pitch + vibTable[pos] * depth * 15 >> 4 / 15), pos += rate
 *   1xx / 2xx slide    NOTE_PORTA(speed * 4, 255 | -60) every tick, PRE_PORTA at the start
 *   3xx portamento     NOTE_PORTA(speed * 4, note) every tick, PRE_PORTA at the start
 *   5xy = 4 + Axy with the remembered vibrato; 6xy = 3 + Axy with the remembered portamento.
 *   E1xy / E2xy        shorthand slide (FurnaceSequencer.cpp case 0xe1/0xe2): y semitones up/down at
 *                      speed x*4, NOTE_PORTA every tick until the target, then LEGATO target; it runs
 *                      on across rows like upstream.
 *   E5xx fine pitch    pitch = xx - 0x80 (0x80 = centre), sent as PITCH with the vibrato added.
 * Defaults of a new Furnace song: linear pitch (slide speed x4), vibrato fine 15, sine vibrato,
 * no "no slides on first tick". Not ported: vibrato shapes (E3x), fine vibrato (E4x), volume slide
 * targets, the slide stop on reaching the target (the dispatch return value is not visible here;
 * a chip holds the target by itself).
 */
import { DivCmd } from './FurnaceDispatchEngine';

/** A cell effect of the row: Furnace effect code and parameter. */
export interface RowEffect {
  effect: number;
  param: number;
}

/** Upstream vibTable / tremTable (engine.cpp:4395-4398), C short truncation. */
const VIB_TABLE: number[] = Array.from({ length: 64 }, (_, i) => Math.trunc(127 * Math.sin((i / 64) * 2 * Math.PI)));
const TREM_TABLE: number[] = Array.from({ length: 128 }, (_, i) => Math.trunc(255 * 0.5 * (1 - Math.cos((i / 128) * 2 * Math.PI))));
/** Compat defaults of a new song: linear pitch multiplies the slide speed by pitchSlideSpeed. */
const PITCH_SLIDE_SPEED = 4;
const VIBRATO_FINE = 15;
/** Linear pitch: one semitone is 128 pitch units (NOTE_FREQUENCY = note << 7). */
const SEMITONE_UNITS = 128;

export interface ChipTickCommand {
  cmd: number;
  val1: number;
  val2: number;
}

interface ChannelTickState {
  /** Chip note (Furnace note number, C-0 = 0) the channel plays; null before the first note. */
  note: number | null;
  /** The 0xy parameter; 0 when no arpeggio runs. */
  arp: number;
  /** Upstream arpStage: -1 before the first step, then 0 (base), 1 (+x), 2 (+y). */
  arpStage: number;
  arpTicks: number;
  /** Slide / portamento: target note (-1 none) and speed (-1 none), as chan.portaNote / portaSpeed. */
  portaNote: number;
  portaSpeed: number;
  lastPorta: number;
  lastVibrato: number;
  vibDepth: number;
  vibRate: number;
  vibPos: number;
  /** Volume slide speed in 1/256 chip volume steps per tick. */
  volSpeed: number;
  tremDepth: number;
  tremRate: number;
  tremPos: number;
  /** Chip volume in 8.8 fixed point (chip units << 8 | 0xff); null until a volume range is known. */
  volume: number | null;
  /** Chip volume maximum in 8.8 fixed point; 0 when the caller gave no chip volume range. */
  volMax: number;
  /** The row holds a tone portamento: its note must not retrigger the channel. */
  holdNote: boolean;
  /** E1xy/E2xy running: ticks left until the target note. */
  shorthandTicks: number;
  /** E5xx fine pitch, 1/128 semitone (0 = centre). */
  pitch: number;
}

function freshState(): ChannelTickState {
  return {
    note: null, arp: 0, arpStage: -1, arpTicks: 1,
    portaNote: -1, portaSpeed: -1, lastPorta: 0, lastVibrato: 0,
    vibDepth: 0, vibRate: 0, vibPos: 0, volSpeed: 0,
    tremDepth: 0, tremRate: 0, tremPos: 0, volume: null, volMax: 0, holdNote: false,
    shorthandTicks: 0, pitch: 0,
  };
}

/** The effect codes FurnaceTickEffects steps itself (the cell router must not send them). */
export const TICK_STEPPED_EFFECTS: ReadonlySet<number> = new Set([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x0A, 0xE1, 0xE2, 0xE5]);

function volSlideSpeed(param: number): number {
  const y = param & 15;
  return y !== 0 ? -y * 64 : (param >> 4) * 64;
}

export class FurnaceTickEffects {
  private readonly channels = new Map<number, ChannelTickState>();
  /** Ticks per arpeggio step; Furnace keeps this per song (effect E0xx), default 1. */
  private arpLen = 1;

  private state(chan: number): ChannelTickState {
    let s = this.channels.get(chan);
    if (!s) {
      s = freshState();
      this.channels.set(chan, s);
    }
    return s;
  }

  /** E0xx: ticks per arpeggio step (upstream ignores 0). */
  setArpSpeed(value: number): void {
    if (value > 0) this.arpLen = value;
  }

  /**
   * Read a row for a channel. note: the chip note of a pitched note on the row, or null.
   * arp: the row's 0xy parameter, or null when the row carries no arpeggio effect (the tracker
   * applies a cell effect for its own row, so a row without one ends a running arpeggio).
   * effects: the row's other stepped effects (1xx-7xy, Axy); the same rule, a row without a slide,
   * vibrato, volume slide or tremolo ends the running one.
   * chipVolMax: the chip channel's volume maximum (0 = unknown, volume effects stay silent).
   * level: the channel volume 0-1 the row sets (Cxx, volume column, a note's velocity), or null.
   * Returns the commands to send now (the base note again when an arpeggio ends).
   */
  beginRow(chan: number, note: number | null, arp: number | null, effects: readonly RowEffect[] = [], chipVolMax = 0, level: number | null = null): ChipTickCommand[] {
    const s = this.state(chan);
    const hadNote = s.note !== null;
    if (note !== null) {
      s.note = note;
      s.vibPos = 0;
    }
    if (chipVolMax > 0) {
      s.volMax = (chipVolMax << 8) | 0xff;
      if (s.volume === null) s.volume = s.volMax;
      if (level !== null) s.volume = (Math.round(Math.max(0, Math.min(1, level)) * chipVolMax) << 8) | 0xff;
    }
    const next = arp ?? 0;
    const out: ChipTickCommand[] = [];
    if (next === 0 && s.arp !== 0 && note === null && s.note !== null) {
      // arp0Reset: back to the base note when the arpeggio stops
      out.push({ cmd: DivCmd.LEGATO, val1: s.note, val2: 0 });
    }
    if (next === 0) {
      s.arpStage = -1;
      s.arpTicks = 1;
    }
    s.arp = next;

    let slide = false;
    let vibrato = false;
    let volSlide = false;
    let tremolo = false;
    s.holdNote = false;
    for (const { effect, param } of effects) {
      switch (effect) {
        case 0xE1:
        case 0xE2: {
          slide = true;
          const semitones = param & 15;
          const speed = (param >> 4) * 4;
          if (semitones === 0 || speed === 0 || s.note === null) this.stopPorta(s, out);
          else {
            s.portaNote = s.note + (effect === 0xE1 ? semitones : -semitones);
            s.portaSpeed = speed;
            s.shorthandTicks = Math.ceil((semitones * SEMITONE_UNITS) / (speed * PITCH_SLIDE_SPEED));
            out.push({ cmd: DivCmd.PRE_PORTA, val1: 1, val2: 0 });
          }
          break;
        }
        case 0xE5:
          s.pitch = param - 0x80;
          out.push({ cmd: DivCmd.PITCH, val1: s.pitch + this.vibratoPitch(s), val2: 0 });
          break;
        case 0x01:
        case 0x02:
          slide = true;
          s.shorthandTicks = 0;
          if (param === 0) this.stopPorta(s, out);
          else {
            s.portaNote = effect === 0x01 ? 255 : -60;
            s.portaSpeed = param;
            out.push({ cmd: DivCmd.PRE_PORTA, val1: 1, val2: 0 });
          }
          break;
        case 0x03:
          slide = true;
          s.shorthandTicks = 0;
          if (param === 0) this.stopPorta(s, out);
          else {
            s.lastPorta = param;
            this.startTonePorta(s, param, hadNote, note !== null, out);
          }
          break;
        case 0x04:
          vibrato = true;
          if (param !== 0) s.lastVibrato = param;
          this.setVibrato(s, param, out);
          break;
        case 0x05:
          vibrato = true;
          volSlide = true;
          this.setVibrato(s, param === 0 ? 0 : s.lastVibrato, out);
          this.setVolSlide(s, param);
          break;
        case 0x06:
          slide = true;
          volSlide = true;
          s.shorthandTicks = 0;
          if (param === 0 || s.lastPorta === 0) this.stopPorta(s, out);
          else this.startTonePorta(s, s.lastPorta, hadNote, note !== null, out);
          this.setVolSlide(s, param);
          break;
        case 0x07:
          tremolo = true;
          if (s.tremDepth === 0) s.tremPos = 0;
          s.tremDepth = param & 15;
          s.tremRate = param >> 4;
          if (s.tremDepth !== 0) s.volSpeed = 0;
          else this.restoreVolume(s, out);
          break;
        case 0x0A:
          volSlide = true;
          this.setVolSlide(s, param);
          break;
      }
      if (effect === 0x07 && s.tremDepth !== 0) volSlide = false;
    }
    // A row without the effect ends the running one; an E1xy/E2xy slide runs on to its target.
    // shortcut: a new note ends a running E1xy/E2xy here; upstream's exact rule for that case is not ported.
    if (!slide && s.portaSpeed !== -1 && (s.shorthandTicks === 0 || note !== null)) this.stopPorta(s, out);
    if (!vibrato && s.vibDepth !== 0) this.setVibrato(s, 0, out);
    if (!volSlide) s.volSpeed = 0;
    if (!tremolo && s.tremDepth !== 0) {
      s.tremDepth = 0;
      this.restoreVolume(s, out);
    }
    return out;
  }

  /** True when the row's note must not retrigger the channel: it is a tone portamento target. */
  holdsNote(chan: number): boolean {
    return this.channels.get(chan)?.holdNote ?? false;
  }

  private stopPorta(s: ChannelTickState, out: ChipTickCommand[]): void {
    s.portaNote = -1;
    s.portaSpeed = -1;
    s.shorthandTicks = 0;
    out.push({ cmd: DivCmd.PRE_PORTA, val1: 0, val2: 0 });
  }

  private startTonePorta(s: ChannelTickState, speed: number, hadNote: boolean, rowHasNote: boolean, out: ChipTickCommand[]): void {
    if (s.note === null) return;
    s.portaNote = s.note;
    s.portaSpeed = speed;
    // The note slides from the sounding one; with nothing sounding it starts normally.
    s.holdNote = rowHasNote && hadNote;
    out.push({ cmd: DivCmd.PRE_PORTA, val1: 1, val2: 1 });
  }

  private setVibrato(s: ChannelTickState, param: number, out: ChipTickCommand[]): void {
    s.vibDepth = param & 15;
    s.vibRate = param >> 4;
    // update pitch now (upstream sends it with the effect)
    out.push({ cmd: DivCmd.PITCH, val1: s.pitch + this.vibratoPitch(s), val2: 0 });
  }

  private vibratoPitch(s: ChannelTickState): number {
    return Math.trunc(((s.vibDepth * VIB_TABLE[s.vibPos] * VIBRATO_FINE) >> 4) / 15);
  }

  private setVolSlide(s: ChannelTickState, param: number): void {
    if (param !== 0) {
      s.volSpeed = volSlideSpeed(param);
      // tremolo and volume slides are incompatible
      s.tremDepth = 0;
      s.tremRate = 0;
    } else {
      s.volSpeed = 0;
    }
  }

  private restoreVolume(s: ChannelTickState, out: ChipTickCommand[]): void {
    if (s.volume !== null && s.volMax > 0) out.push({ cmd: DivCmd.VOLUME, val1: s.volume >> 8, val2: 0 });
  }

  /** One tick of a channel (call on every tick of the row, the first included). */
  tick(chan: number): ChipTickCommand[] {
    const s = this.channels.get(chan);
    if (!s) return [];
    const out: ChipTickCommand[] = [];
    // volume slide or tremolo
    if (s.volume !== null && s.volMax > 0) {
      if (s.volSpeed !== 0) {
        s.volume += s.volSpeed;
        if (s.volume > s.volMax) {
          s.volume = s.volMax;
          s.volSpeed = 0;
        } else if (s.volume < 0) {
          s.volume = 0;
          s.volSpeed = 0;
        }
        out.push({ cmd: DivCmd.VOLUME, val1: s.volume >> 8, val2: 0 });
      } else if (s.tremDepth > 0) {
        s.tremPos = (s.tremPos + s.tremRate) & 127;
        out.push({ cmd: DivCmd.VOLUME, val1: Math.max(0, s.volume - TREM_TABLE[s.tremPos] * s.tremDepth) >> 8, val2: 0 });
      }
    }
    // vibrato
    if (s.vibDepth > 0) {
      s.vibPos += s.vibRate;
      while (s.vibPos >= 64) s.vibPos -= 64;
      out.push({ cmd: DivCmd.PITCH, val1: s.pitch + this.vibratoPitch(s), val2: 0 });
    }
    // portamento and pitch slides (a channel that never had a note has nothing to slide)
    if (s.note !== null && s.portaSpeed > 0) {
      out.push({ cmd: DivCmd.NOTE_PORTA, val1: s.portaSpeed * PITCH_SLIDE_SPEED, val2: s.portaNote });
      // E1xy/E2xy at the target: upstream (portaResult 2) ends the slide and makes the target the note
      if (s.shorthandTicks > 0 && --s.shorthandTicks === 0) {
        s.note = s.portaNote;
        s.portaNote = -1;
        s.portaSpeed = -1;
        out.push({ cmd: DivCmd.LEGATO, val1: s.note, val2: 0 });
      }
    }
    // arpeggio (upstream: not while a slide or portamento runs)
    if (s.arp !== 0 && s.note !== null && s.portaSpeed < 1 && --s.arpTicks < 1) {
      s.arpTicks = this.arpLen;
      s.arpStage = (s.arpStage + 1) % 3;
      const offset = s.arpStage === 0 ? 0 : s.arpStage === 1 ? (s.arp >> 4) : (s.arp & 15);
      out.push({ cmd: DivCmd.LEGATO, val1: s.note + offset, val2: 0 });
    }
    return out;
  }

  /** Forget everything (playback stop or restart). */
  reset(): void {
    this.channels.clear();
    this.arpLen = 1;
  }
}

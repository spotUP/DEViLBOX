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
 * Next effects plug into the same shape (per-channel state, beginRow reads the cell, tick returns
 * commands): vibrato 4xy, volume slide Axy, pitch slides 1xx/2xx, portamento 3xx.
 */
import { DivCmd } from './FurnaceDispatchEngine';

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
}

function freshState(): ChannelTickState {
  return { note: null, arp: 0, arpStage: -1, arpTicks: 1 };
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
   * Returns the commands to send now (the base note again when an arpeggio ends).
   */
  beginRow(chan: number, note: number | null, arp: number | null): ChipTickCommand[] {
    const s = this.state(chan);
    if (note !== null) s.note = note;
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
    return out;
  }

  /** One tick of a channel (call on every tick of the row, the first included). */
  tick(chan: number): ChipTickCommand[] {
    const s = this.channels.get(chan);
    if (!s || s.arp === 0 || s.note === null) return [];
    if (--s.arpTicks >= 1) return [];
    s.arpTicks = this.arpLen;
    s.arpStage = (s.arpStage + 1) % 3;
    const offset = s.arpStage === 0 ? 0 : s.arpStage === 1 ? (s.arp >> 4) : (s.arp & 15);
    return [{ cmd: DivCmd.LEGATO, val1: s.note + offset, val2: 0 }];
  }

  /** Forget everything (playback stop or restart). */
  reset(): void {
    this.channels.clear();
    this.arpLen = 1;
  }
}
